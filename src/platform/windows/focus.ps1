# Toggles Do Not Disturb by suppressing toast notifications.
#
# Windows exposes no public API for Focus Assist / Focus Sessions, and the
# Win11 focus state lives in an opaque CloudStore blob that is not safe to
# write. What *is* documented and stable is the global toast switch, which is
# the same setting the Notifications page flips. So Windows gets one mode —
# "Do Not Disturb" — rather than macOS's list of user-named Focus modes.
#
# The user-visible effect is the one that matters during deep work: no toasts.
# It does not suppress the Win11 focus timer, taskbar badges, or app sounds,
# and win32.js is explicit about that in what it reports to the UI.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('enable', 'disable')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

# 0 suppresses toasts, 1 restores them — so enabling DND writes 0.
$key       = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings'
$valueName = 'NOC_GLOBAL_SETTING_TOASTS_ENABLED'

# Where Helm remembers what it found. Most machines have never set this value at
# all, so disabling DND by asserting 1 left behind a value Helm invented and
# called it restored. Recording the prior state in Helm's own key — rather than
# in app memory — means a crash or restart mid-focus-session still restores
# correctly.
$helmKey   = 'HKCU:\SOFTWARE\Helm'
$priorName = 'PriorToastState'

function Get-Toasts {
    $p = Get-ItemProperty -Path $key -Name $valueName -ErrorAction SilentlyContinue
    if ($null -eq $p) { return $null }
    return $p.$valueName
}

function Set-Toasts([int]$v) {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name $valueName -Value $v -PropertyType DWord -Force | Out-Null
}

try {
    if ($Action -eq 'enable') {
        if (-not (Test-Path $helmKey)) { New-Item -Path $helmKey -Force | Out-Null }
        # Record once. A second enable must not overwrite the user's original
        # state with the 0 Helm itself wrote.
        $already = Get-ItemProperty -Path $helmKey -Name $priorName -ErrorAction SilentlyContinue
        if ($null -eq $already) {
            $current = Get-Toasts
            $save = if ($null -eq $current) { 'absent' } else { [string][int]$current }
            New-ItemProperty -Path $helmKey -Name $priorName -Value $save -PropertyType String -Force | Out-Null
        }
        Set-Toasts 0
    } else {
        $saved = $null
        $p = Get-ItemProperty -Path $helmKey -Name $priorName -ErrorAction SilentlyContinue
        if ($null -ne $p) { $saved = $p.$priorName }

        if ($saved -eq 'absent') {
            # Write 1 before removing. The write is what Explorer reliably
            # notices; the removal leaves the key the shape Helm found it in.
            # Both states mean "toasts enabled", so the order is safe either way.
            Set-Toasts 1
            Remove-ItemProperty -Path $key -Name $valueName -ErrorAction SilentlyContinue
        } elseif ($null -ne $saved) {
            Set-Toasts ([int]$saved)
        } else {
            # Asked to disable something this machine has no record of enabling.
            Set-Toasts 1
        }
        Remove-ItemProperty -Path $helmKey -Name $priorName -ErrorAction SilentlyContinue
    }
    Write-Output "ok"
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
