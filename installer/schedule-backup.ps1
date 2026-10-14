<#
.SYNOPSIS
  Creates (or with -Remove, deletes) the daily database backup task in Windows Task Scheduler.
  Called by the installer; can also be run by hand.
#>
[CmdletBinding()]
param(
    [switch]$Remove,
    [string]$At = '22:00',
    [string]$TaskName = 'A.Y Scan daily backup'
)

$ErrorActionPreference = 'Stop'
$taskName = $TaskName

try {
    if ($Remove) {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        Write-Host 'Backup task removed.'
        exit 0
    }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $script = Join-Path $PSScriptRoot 'backup.ps1'
    $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    $trigger = New-ScheduledTaskTrigger -Daily -At $At
    # StartWhenAvailable: a backup missed because the PC was off runs at the next opportunity.
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Daily PostgreSQL backup of A.Y Scan' -Force | Out-Null
    Write-Host "Daily backup scheduled at $At."
} catch {
    Write-Host "Could not change the backup task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
