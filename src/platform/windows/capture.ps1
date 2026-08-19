# Enumerates visible top-level application windows and prints them as JSON.
#
# This is the Windows counterpart to capture.jxa, but it answers a strictly
# smaller question. macOS can ask an app what it holds (every Chrome tab, the
# Preview document, the Terminal cwd) over Apple Events. Windows has no such
# channel, so all we can read is the window list: process, executable, title.
# Turning a title back into something openable happens in JS — see win32.js.
#
# Why P/Invoke instead of `Get-Process | ? MainWindowTitle`: that only exposes
# one window per process, which would collapse a three-window Chrome session
# into a single row. Chrome multi-window is the case this product exists for.
#
# -CacheDir enables the compiled-assembly cache described at Import-HelmWindows.
# Left empty the script compiles inline every run, which is correct but slow;
# win32.js passes Helm's userData directory. Defaulting to off keeps a bare
# `powershell -File capture.ps1` (verify-windows.ps1 section 3) side-effect free.

param([string]$CacheDir = '')

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$HelmWindowsSource = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class HelmWindows {
    private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr h, StringBuilder s, int max);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const uint GW_OWNER = 4;
    private const int DWMWA_CLOAKED = 14;

    public class Win {
        public string Title;
        public uint Pid;
        public long Handle;
    }

    // Windows 10+ keeps UWP windows alive but "cloaked" when they are not on
    // screen. They pass IsWindowVisible, so without this check every Store app
    // the user has ever opened shows up in the capture list.
    private static bool IsCloaked(IntPtr h) {
        int cloaked;
        if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, sizeof(int)) != 0) return false;
        return cloaked != 0;
    }

    private static bool IsRealAppWindow(IntPtr h) {
        if (!IsWindowVisible(h)) return false;
        if (GetWindow(h, GW_OWNER) != IntPtr.Zero) return false;
        if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return false;
        if (GetWindowTextLength(h) == 0) return false;
        if (IsCloaked(h)) return false;
        return true;
    }

    private static string TextOf(IntPtr h) {
        int len = GetWindowTextLength(h);
        if (len == 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    // Store apps are hosted by ApplicationFrameHost.exe, so the owning PID of
    // the visible window is the host, not the app. The real process owns a
    // child window; find it by looking for the first child with a different PID.
    private static uint ResolveHostedPid(IntPtr h, uint hostPid) {
        uint found = hostPid;
        EnumChildWindows(h, delegate(IntPtr child, IntPtr _) {
            uint childPid;
            GetWindowThreadProcessId(child, out childPid);
            if (childPid != hostPid && childPid != 0) { found = childPid; return false; }
            return true;
        }, IntPtr.Zero);
        if (found != hostPid) return found;

        // The child walk only works while the app is foreground. Windows 10
        // detaches the app's CoreWindow from the frame when it loses focus:
        // it becomes a cloaked top-level window and the frame's children are
        // all host-owned chrome. Recover it by title — the frame mirrors the
        // hosted app's window title exactly.
        string frameTitle = TextOf(h);
        if (frameTitle.Length == 0) return hostPid;
        EnumWindows(delegate(IntPtr cand, IntPtr _) {
            uint candPid;
            GetWindowThreadProcessId(cand, out candPid);
            if (candPid == hostPid || candPid == 0) return true;
            StringBuilder cls = new StringBuilder(64);
            GetClassName(cand, cls, cls.Capacity);
            if (cls.ToString() != "Windows.UI.Core.CoreWindow") return true;
            if (TextOf(cand) != frameTitle) return true;
            found = candPid;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    public static List<Win> List(string hostProcessName) {
        List<Win> results = new List<Win>();
        EnumWindows(delegate(IntPtr h, IntPtr _) {
            if (!IsRealAppWindow(h)) return true;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pid == 0) return true;
            Win w = new Win();
            w.Title = TextOf(h);
            w.Pid = pid;
            w.Handle = h.ToInt64();
            results.Add(w);
            return true;
        }, IntPtr.Zero);
        return results;
    }

    public static uint HostedPidFor(long handle, uint hostPid) {
        return ResolveHostedPid(new IntPtr(handle), hostPid);
    }
}
'@

# Every capture spawns a fresh powershell.exe, so an in-process type cache buys
# nothing — the C# above is recompiled from scratch on each call, which costs
# more than the window enumeration it exists to perform. Compile it once to a
# DLL under $CacheDir instead and load that on later runs.
#
# The cache file is named after the SHA-256 of the source it was built from, so
# an edit to the C# — or a stale DLL left by an older Helm — can never satisfy
# the lookup; it simply misses and recompiles under a new name.
#
# Loading the bytes rather than Add-Type -Path / Assembly::LoadFrom is
# deliberate on two counts: LoadFrom pins a lock on the file for the life of
# the process, which would make a concurrent instance's replace fail, and the
# Add-Type cmdlet drags in the compiler infrastructure even when handed a
# prebuilt assembly, costing nearly as much as compiling.
#
# Any problem here — unwritable directory, truncated or corrupt DLL, a race
# with another instance — falls through to the plain inline compile. Capture
# must never fail because a cache is bad.
function Import-HelmWindows([string]$Source, [string]$Dir) {
    if ($Dir) {
        try {
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $digest = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Source))
            } finally { $sha.Dispose() }
            $stamp = ([BitConverter]::ToString($digest) -replace '-', '').Substring(0, 16)
            $dll = Join-Path $Dir "capture-$stamp.dll"

            if (Test-Path -LiteralPath $dll) {
                try {
                    $asm = [System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($dll))
                    if ($asm.GetType('HelmWindows')) { return }
                } catch { }
                Remove-Item -LiteralPath $dll -Force -ErrorAction SilentlyContinue
            }

            if (-not (Test-Path -LiteralPath $Dir)) {
                [void](New-Item -ItemType Directory -Path $Dir -Force -ErrorAction Stop)
            }

            # Compile to a private name first: a reader must never see a
            # half-written DLL, and two instances racing must not corrupt each
            # other's output.
            $staging = Join-Path $Dir ("staging-$stamp-" + [Guid]::NewGuid().ToString('N') + '.dll')
            Add-Type -TypeDefinition $Source -OutputAssembly $staging -OutputType Library -ErrorAction Stop
            [void][System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($staging))
            try { Move-Item -LiteralPath $staging -Destination $dll -Force -ErrorAction Stop }
            catch { Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue }

            # Sweep DLLs from older versions of this source, plus any staging
            # file orphaned by a crash between the compile and the move. The
            # age guard keeps the sweep off a concurrent instance's staging file.
            $stale = (Get-Date).AddMinutes(-5)
            Get-ChildItem -LiteralPath $Dir -Filter '*.dll' -ErrorAction SilentlyContinue |
                Where-Object {
                    ($_.Name -like 'capture-*' -and $_.Name -ne "capture-$stamp.dll") -or
                    ($_.Name -like 'staging-*' -and $_.LastWriteTime -lt $stale)
                } |
                ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
            return
        } catch { }
    }
    Add-Type -TypeDefinition $Source
}

Import-HelmWindows $HelmWindowsSource $CacheDir

# `Get-Process -Id <n>` walks the entire process table on every call, so asking
# per window cost ~15 ms each and dominated the run. One snapshot, indexed.
$procById = $null
$procCache = @{}
function Get-ProcInfo([uint32]$procId) {
    if ($procCache.ContainsKey($procId)) { return $procCache[$procId] }
    if ($null -eq $script:procById) {
        $script:procById = @{}
        foreach ($proc in (Get-Process -ErrorAction SilentlyContinue)) { $script:procById[[int]$proc.Id] = $proc }
    }
    $p = $script:procById[[int]$procId]
    $info = $null
    if ($p) {
        $exePath = ''
        try { $exePath = $p.Path } catch { $exePath = '' }
        # .Description is the executable's FileDescription resource, which is
        # what Task Manager shows: "Google Chrome", not "chrome". Falls back to
        # the process name for executables with no version resource.
        $desc = ''
        try { $desc = $p.Description } catch { $desc = '' }
        if (-not $desc) { $desc = $p.ProcessName }
        $info = [PSCustomObject]@{ Name = $p.ProcessName; Path = $exePath; Description = $desc }
    }
    $procCache[$procId] = $info
    return $info
}

# File Explorer windows expose their current folder through the shell COM
# automation object, keyed by window handle. This is the only place a folder
# path is recoverable — the window title is just the leaf folder name, which
# is ambiguous across drives.
$explorerPaths = @{}
try {
    $shell = New-Object -ComObject Shell.Application
    foreach ($w in $shell.Windows()) {
        try {
            $p = $w.Document.Folder.Self.Path
            if ($p -and (Test-Path -LiteralPath $p)) { $explorerPaths[[long]$w.HWND] = $p }
        } catch { }
    }
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
} catch { }

$out = New-Object System.Collections.ArrayList

foreach ($w in [HelmWindows]::List('ApplicationFrameHost')) {
    $info = Get-ProcInfo $w.Pid
    if (-not $info) { continue }

    # Unwrap UWP hosting so the row reports the actual app, not the frame host.
    if ($info.Name -eq 'ApplicationFrameHost') {
        $realPid = [HelmWindows]::HostedPidFor($w.Handle, $w.Pid)
        if ($realPid -ne $w.Pid) {
            $realInfo = Get-ProcInfo $realPid
            if ($realInfo) { $info = $realInfo }
        }
    }

    $row = [ordered]@{
        process     = $info.Name
        description = $info.Description
        exePath     = $info.Path
        title       = $w.Title
        pid         = [int]$w.Pid
    }
    if ($explorerPaths.ContainsKey($w.Handle)) { $row.folderPath = $explorerPaths[$w.Handle] }

    [void]$out.Add([PSCustomObject]$row)
}

# Depth matters: default ConvertTo-Json depth would stringify nested objects.
# -Compress keeps the payload small enough for a single stdout read.
if ($out.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject $out.ToArray() -Depth 3 -Compress }
