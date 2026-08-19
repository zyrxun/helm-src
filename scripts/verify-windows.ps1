# Standalone Windows verification for the Helm port.
#
# Run this FIRST, before npm install — it has no dependencies and catches the
# failures that would otherwise look like mysterious runtime errors later:
# a PowerShell syntax error, embedded C# that will not compile, or a capture
# that returns nothing useful.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-windows.ps1
#
# It is read-only. It never closes a window and never writes the DND registry
# value; it only reads the current one.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$psDir = Join-Path $root 'src\platform\windows'
$fail = 0

function Section($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Pass($t)    { Write-Host "  PASS  $t" -ForegroundColor Green }
function Fail($t)    { Write-Host "  FAIL  $t" -ForegroundColor Red; $script:fail++ }
function Note($t)    { Write-Host "        $t" -ForegroundColor DarkGray }

Write-Host "Helm Windows verification"
Write-Host "PowerShell $($PSVersionTable.PSVersion)  |  $([System.Environment]::OSVersion.VersionString)"
Note "repo: $root"

# ── 1. Do the scripts parse at all ───────────────────────────────────────────
Section '1. PowerShell parse check'
$scripts = @('capture.ps1', 'close.ps1', 'focus.ps1')
foreach ($s in $scripts) {
    $p = Join-Path $psDir $s
    if (-not (Test-Path $p)) { Fail "$s missing at $p"; continue }
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        Fail "$s has $($errors.Count) parse error(s)"
        foreach ($e in $errors | Select-Object -First 5) {
            Note "line $($e.Extent.StartLineNumber): $($e.Message)"
        }
    } else { Pass "$s parses" }
}

# ── 2. Does the embedded C# compile ──────────────────────────────────────────
# Add-Type is where a bad P/Invoke signature actually surfaces. Extract each
# here-string and compile it under a unique class name so both can coexist.
Section '2. Embedded C# compiles (Add-Type)'
foreach ($s in @('capture.ps1', 'close.ps1')) {
    $p = Join-Path $psDir $s
    if (-not (Test-Path $p)) { continue }
    $text = Get-Content -Raw -LiteralPath $p
    $m = [regex]::Match($text, "(?s)@'\r?\n(.*?)\r?\n'@")
    if (-not $m.Success) { Fail "$s : no here-string found"; continue }
    $cs = $m.Groups[1].Value -replace 'class Helm', 'class Verify'
    try {
        Add-Type -TypeDefinition $cs -ErrorAction Stop
        Pass "$s C# compiles"
    } catch {
        Fail "$s C# failed to compile"
        Note $_.Exception.Message
    }
}

# ── 3. Does capture actually return usable rows ──────────────────────────────
Section '3. capture.ps1 live run'
$capture = Join-Path $psDir 'capture.ps1'
$rows = @()
if (Test-Path $capture) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $raw = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $capture 2>&1
    $sw.Stop()
    $joined = ($raw | Out-String).Trim()
    if (-not $joined) {
        Fail 'capture.ps1 produced no output'
    } else {
        try {
            $parsed = $joined | ConvertFrom-Json
            $rows = @($parsed)
            Pass "capture.ps1 returned $($rows.Count) window(s) in $($sw.ElapsedMilliseconds) ms"
        } catch {
            Fail 'capture.ps1 output is not valid JSON'
            Note $joined.Substring(0, [Math]::Min(300, $joined.Length))
        }
    }
}

if ($rows.Count -gt 0) {
    Note ''
    Note 'Captured windows (process | description | title):'
    foreach ($r in $rows | Select-Object -First 30) {
        $t = if ($r.title.Length -gt 58) { $r.title.Substring(0, 58) + '...' } else { $r.title }
        $extra = if ($r.folderPath) { "  [$($r.folderPath)]" } else { '' }
        Note ("  {0,-22} {1,-24} {2}{3}" -f $r.process, $r.description, $t, $extra)
    }
    if ($rows.Count -gt 30) { Note "  ... and $($rows.Count - 30) more" }

    # Anything here means SKIP_PROCESSES in win32.js needs another entry.
    Note ''
    $shellish = $rows | Where-Object {
        $_.process -match '^(explorer|textinputhost|shellexperiencehost|searchhost|searchapp|startmenuexperiencehost|lockapp|peopleexperiencehost|widgets|widgetboard|systemsettings|applicationframehost)$'
    }
    if ($shellish) {
        Write-Host "  NOTE  $($shellish.Count) shell-surface window(s) captured; win32.js filters these:" -ForegroundColor Yellow
        foreach ($r in $shellish | Select-Object -First 8) { Note "  $($r.process) : $($r.title)" }
    } else { Pass 'no shell-surface windows in the raw capture' }

    $noExe = $rows | Where-Object { -not $_.exePath }
    if ($noExe) {
        Write-Host "  NOTE  $($noExe.Count) window(s) with no resolvable exePath (these cannot be launched or closed):" -ForegroundColor Yellow
        foreach ($r in $noExe | Select-Object -First 8) { Note "  $($r.process) : $($r.title)" }
    } else { Pass 'every window resolved an exePath' }
}

# ── 4. The assumption the whole URL recovery rests on ────────────────────────
# Helm turns a browser window title back into a URL by matching it against the
# History DB's `title` column. If the caption is decorated or truncated
# relative to what Chrome stored, that match fails and every browser row
# captures without a URL. This prints the exact strings so it can be judged.
Section '4. Browser window titles (the title -> History match)'
$browsers = @(
    @{ Proc = 'chrome';  Name = 'Google Chrome';   Root = "$env:LOCALAPPDATA\Google\Chrome\User Data" },
    @{ Proc = 'msedge';  Name = 'Microsoft Edge';  Root = "$env:LOCALAPPDATA\Microsoft\Edge\User Data" }
)
if ($rows.Count -eq 0) {
    # Without this, a failed section 3 makes every browser look absent, which
    # reads as "nothing to check" rather than "this check never ran".
    Note 'skipped: section 3 returned no capture data, so there are no captions to compare'
}
foreach ($b in $browsers) {
    if ($rows.Count -eq 0) { continue }
    $mine = @($rows | Where-Object { $_.process -eq $b.Proc })
    if ($mine.Count -eq 0) { Note "$($b.Name): not running"; continue }
    Write-Host "  $($b.Name): $($mine.Count) window(s)" -ForegroundColor White
    foreach ($r in $mine) {
        Note "  raw caption : $($r.title)"
        $stripped = $r.title -replace '\s+[-–—]\s+Google Chrome$', '' `
                             -replace '\s+[-–—]\s+Microsoft​?\s*Edge$', ''
        if ($stripped -eq $r.title) {
            Write-Host "  MISMATCH    suffix regex did not strip -- win32.js titleSuffix needs updating" -ForegroundColor Red
            $script:fail++
        } else {
            Note "  -> tab title: $stripped"
        }
    }
}

# ── 5. Chromium profile catalog ──────────────────────────────────────────────
# The display name here must be the one the app shows. `listProfiles()` in
# electron/platform/chrome.js resolves `gaia_given_name`, falling back to
# `name`, falling back to the directory; reading `name` alone made the harness
# disagree with the app about the same profile, which defeats the point of a
# harness. Keep this in step with chrome.js if that resolution ever changes.
function Resolve-ProfileName($info, $dir) {
    foreach ($field in @('gaia_given_name', 'name')) {
        if ($info -and $info.PSObject.Properties[$field]) {
            $v = $info.$field
            if ($null -ne $v -and "$v" -ne '') { return "$v" }
        }
    }
    return $dir
}

Section '5. Chromium profiles (Local State)'
foreach ($b in $browsers) {
    $ls = Join-Path $b.Root 'Local State'
    if (-not (Test-Path $ls)) { Note "$($b.Name): no user data at $($b.Root)"; continue }
    try {
        $state = Get-Content -Raw -LiteralPath $ls | ConvertFrom-Json
        $cache = $state.profile.info_cache
        $names = @($cache.PSObject.Properties)
        Pass "$($b.Name): $($names.Count) profile(s)"
        foreach ($n in $names | Select-Object -First 10) {
            $hist = Join-Path (Join-Path $b.Root $n.Name) 'History'
            $has  = if (Test-Path $hist) { 'History OK' } else { 'NO History DB' }
            $display = Resolve-ProfileName $n.Value $n.Name
            $raw = $n.Value.name
            # Both fields, when they differ, so a caption that carries the other
            # one is still recognisable here.
            $alt = if ($null -ne $raw -and "$raw" -ne '' -and "$raw" -ne $display) { "   (Local State name: $raw)" } else { '' }
            Note "  $($n.Name)  ->  $display   [$has]$alt"
        }
        if ($names.Count -gt 10) { Note "  ... and $($names.Count - 10) more" }
        $unlisted = @($names | Where-Object { $_.Name -notmatch '^(Default|Profile [0-9]+)$' })
        if ($unlisted.Count -gt 0) {
            $unlistedDirs = ($unlisted | ForEach-Object { $_.Name }) -join ', '
            Note ("  the app's picker skips {0} of these -- directory name is not Default/Profile N: {1}" -f $unlisted.Count, $unlistedDirs)
        }
    } catch { Fail "$($b.Name): could not parse Local State"; Note $_.Exception.Message }
}

# ── 6. DND registry lever (read only) ────────────────────────────────────────
Section '6. Do Not Disturb registry key (read only)'
$key = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings'
if (Test-Path $key) {
    $v = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED
    if ($null -eq $v) { Note 'key exists, NOC_GLOBAL_SETTING_TOASTS_ENABLED not set yet (focus.ps1 will create it)' }
    else { Note "current value: $v  (0 = toasts suppressed, 1 = normal)" }
    Pass 'notifications key reachable'
    # focus.ps1 records the pre-Helm state here and clears it on disable. A
    # value left behind means Helm was killed mid-focus-session and the machine
    # is still holding Helm's DND setting.
    $prior = (Get-ItemProperty -Path 'HKCU:\SOFTWARE\Helm' -ErrorAction SilentlyContinue).PriorToastState
    if ($null -ne $prior) {
        Write-Host "  NOTE  Helm has a focus session open: prior toast state recorded as '$prior'" -ForegroundColor Yellow
        Note 'disable focus mode in Helm to restore it, or delete HKCU:\SOFTWARE\Helm\PriorToastState'
    }
} else {
    Note 'key does not exist yet; focus.ps1 creates it on first use'
}

# ── 7. Environment Helm depends on ───────────────────────────────────────────
Section '7. Environment'
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path $ps) { Pass "powershell.exe at expected absolute path" } else { Fail "powershell.exe NOT at $ps -- win32.js POWERSHELL constant is wrong" }
if ($env:LOCALAPPDATA) { Pass "LOCALAPPDATA set" } else { Fail 'LOCALAPPDATA not set' }
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Note "node: $((& node --version 2>$null))" } else { Note 'node not on PATH (needed for npm install)' }

Section 'Result'
if ($fail -eq 0) {
    Write-Host "All checks passed. Next: npm install; npm run menu-bar:win" -ForegroundColor Green
} else {
    Write-Host "$fail check(s) failed -- see FAIL/MISMATCH lines above." -ForegroundColor Red
}
Write-Host ''
# Exit code, not just colour: without this the harness reports failures and
# still exits 0, so anything scripted around it reads a clean run.
if ($fail -ne 0) { exit 1 }
