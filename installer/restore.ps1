<#
.SYNOPSIS
  Restores the A.Y Scan database from a backup file created by backup.ps1.
.DESCRIPTION
  Replaces ALL current data with the backup's contents. A safety backup of the current data is taken first.
  The server is stopped during the restore; start it again afterwards.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\restore.ps1 -BackupFile .\backups\ayscan-20261013-220000.dump
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    # Skip the typed confirmation (for scripted recovery only).
    [switch]$Force
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

try {
    if (-not (Test-Path -LiteralPath $script:EnvFile)) { throw 'A.Y Scan is not installed (.env is missing).' }
    $resolved = (Resolve-Path -LiteralPath $BackupFile).Path
    Import-DotEnv | Out-Null

    if (-not $Force) {
        Write-Host "This replaces ALL current A.Y Scan data with: $resolved" -ForegroundColor Yellow
        $answer = Read-Host 'Type RESTORE to continue'
        if ($answer -ne 'RESTORE') { Write-Host 'Restore cancelled.'; exit 0 }
    }

    Write-Step 'Taking a safety backup of the current data'
    & (Join-Path $PSScriptRoot 'backup.ps1') -KeepDays 3650
    if ($LASTEXITCODE -ne 0) { throw 'The safety backup failed; nothing was changed.' }

    Write-Step 'Stopping the server'
    & (Join-Path $PSScriptRoot 'stop.ps1') -ServerOnly

    Write-Step 'Restoring the database'
    if (Test-UsesDockerDatabase) {
        Start-Database
        $docker = Get-DockerCommand
        $containerPath = '/tmp/ayscan-restore.dump'
        Invoke-Checked $docker @('cp', $resolved, "$($script:DatabaseContainer):$containerPath") 'Copying the backup into the container failed.'
        try {
            Invoke-Checked $docker @('exec', $script:DatabaseContainer, 'pg_restore', '-U', $env:POSTGRES_USER, '-d', $env:POSTGRES_DB, '--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error', $containerPath) 'pg_restore failed; the database was left unchanged.'
        } finally {
            & $docker exec $script:DatabaseContainer rm -f $containerPath | Out-Null
        }
    } else {
        $pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
        if ($null -eq $pgRestore) { throw 'pg_restore was not found on PATH (needed for an external database).' }
        Invoke-Checked $pgRestore.Source @('--dbname', $env:DATABASE_URL, '--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error', $resolved) 'pg_restore failed; the database was left unchanged.'
    }
    Write-Host ''
    Write-Host 'Restore completed. Start A.Y Scan again with the desktop shortcut or installer\start.cmd.' -ForegroundColor Green
} catch {
    Write-Host "Restore failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
