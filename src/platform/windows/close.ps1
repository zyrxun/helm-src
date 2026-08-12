# Closes application windows gracefully.
#
# Graceful means WM_CLOSE, not TerminateProcess: WM_CLOSE is the same message
# the title-bar X sends, so an app with unsaved work shows its own save prompt
# and the user stays in control. macOS presses Cmd+S before quitting editors;
# we deliberately do not simulate keystrokes here — injecting Ctrl+S into
# whatever happens to be focused is a good way to corrupt an unrelated
# document. Letting each app run its own close handler is both safer and more
# native.
#
# Usage:
#   close.ps1 -ProcessName chrome [-TitleFilter "<title>|<title>"]
#   close.ps1 -ProcessName notepad
#
# With -TitleFilter, only windows whose title matches an entry in the list are
# closed; this is how a single Chrome profile's windows are closed without
# touching the others, since Chrome runs every profile under one browser
# process and killing the PID would take all of them down.
#
# A match is exact-or-prefix. Helm stores the bare tab title, while the live
# window title appends the browser name and, on Edge, the profile and an
# "and N more pages" count. Requiring equality would mean browser teardown
# silently never fired.

param(
    [Parameter(Mandatory = $true)][string]$ProcessName,
    [string]$TitleFilter = ''
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class HelmClose {
    private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr wp, IntPtr lp, uint flags, uint timeout, out IntPtr result);

    private const uint WM_CLOSE = 0x0010;
    private const uint GW_OWNER = 4;
    private const uint SMTO_ABORTIFHUNG = 0x0002;

    public static List<IntPtr> TopLevelFor(uint[] pids) {
        List<IntPtr> hits = new List<IntPtr>();
        HashSet<uint> want = new HashSet<uint>(pids);
        EnumWindows(delegate(IntPtr h, IntPtr _) {
            if (!IsWindowVisible(h)) return true;
            if (GetWindow(h, GW_OWNER) != IntPtr.Zero) return true;
            if (GetWindowTextLength(h) == 0) return true;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (want.Contains(pid)) hits.Add(h);
            return true;
        }, IntPtr.Zero);
        return hits;
    }

    public static string TitleOf(IntPtr h) {
        int len = GetWindowTextLength(h);
        if (len == 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    // SendMessageTimeout rather than SendMessage so one hung window cannot
    // stall the whole teardown; ABORTIFHUNG returns instead of blocking.
    public static void Close(IntPtr h) {
        IntPtr result;
        SendMessageTimeout(h, WM_CLOSE, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 3000, out result);
    }
}
'@

# Not `Get-Process -Name $ProcessName`: -Name is a wildcard parameter, so a
# process name containing [ ] would silently widen the match. Compare exactly.
$procs = @(Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq $ProcessName })
if ($procs.Count -eq 0) {
    Write-Output 'Not running'
    exit 0
}

$pids = [uint32[]]($procs | ForEach-Object { [uint32]$_.Id })
$windows = [HelmClose]::TopLevelFor($pids)

$wanted = $null
if ($TitleFilter -ne '') {
    $wanted = @()
    foreach ($t in $TitleFilter.Split([char]31)) {
        if ($t -ne '') { $wanted += $t }
    }
    if ($wanted.Count -eq 0) { $wanted = $null }
}

$closed = 0
foreach ($h in $windows) {
    if ($null -ne $wanted) {
        $title = [HelmClose]::TitleOf($h)
        $hit = $false
        foreach ($t in $wanted) {
            # StartsWith, not -like: the filter is a window title and may legally
            # contain *, ? and [ ], which -like would treat as wildcards and
            # match far more windows than intended.
            if ($title -eq $t -or $title.StartsWith($t, [StringComparison]::Ordinal)) {
                $hit = $true
                break
            }
        }
        if (-not $hit) { continue }
    }
    [HelmClose]::Close($h)
    $closed++
}

# A title filter that matched nothing means the profile's windows are already
# gone (or were renamed mid-teardown). Closing everything as a "fallback" here
# would close the user's other profiles, so report and stop instead.
if ($closed -eq 0 -and $null -ne $wanted) {
    Write-Output 'No matching windows'
} else {
    Write-Output "Closed $closed"
}
