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

$key = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings'
# 0 suppresses toasts, 1 restores them — so enabling DND writes 0.
$value = if ($Action -eq 'enable') { 0 } else { 1 }

try {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' `
        -Value $value -PropertyType DWord -Force | Out-Null
    Write-Output "ok"
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
