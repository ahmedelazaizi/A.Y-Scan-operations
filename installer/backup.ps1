<#
.SYNOPSIS
  Creates a compressed PostgreSQL backup (pg_dump custom format) in the backups folder and prunes old ones.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\backup.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\backup.ps1 -Destination D:\AYScanBackups -KeepDays 60
#>
[CmdletBinding()]
param(
    [string]$Destination,
    [ValidateRange(1, 3650)][int]$KeepDays = 30,
    # Always keep at least this many of the newest backups, whatever their age.
    [ValidateRange(1, 1000)][int]$KeepMinimum = 7
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

function Get-BackupDirectory {
    if ($Destination) { return $Destination }
    if ($env:BACKUP_DIR) { return $env:BACKUP_DIR }
    return (Join-Path $script:ProjectRoot 'backups')
}

try {
    Import-RuntimeEnvironment
    $directory = Get-BackupDirectory
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $fileName = "ayscan-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
    $target = Join-Path $directory $fileName

    if (Test-EmbeddedDatabase) {
        $startedHere = Start-EmbeddedDatabaseIfNeeded
        try {
            $credentials = Get-EmbeddedCredentials
            Invoke-EmbeddedPg 'pg_dump' @('-d', $credentials.database, '--format=custom', '--no-owner', '-f', $target) 'pg_dump failed.'
        } finally {
            if ($startedHere) { Stop-EmbeddedDatabase }
        }
    } elseif (Test-UsesDockerDatabase) {
        Start-Database
        $docker = Get-DockerCommand
        $containerPath = "/tmp/$fileName"
        # pg_dump writes inside the container and the file is copied out, so binary output never passes through the console.
        Invoke-Checked $docker @('exec', $script:DatabaseContainer, 'pg_dump', '-U', $env:POSTGRES_USER, '-d', $env:POSTGRES_DB, '--format=custom', '--no-owner', '-f', $containerPath) 'pg_dump failed.'
        try {
            Invoke-Checked $docker @('cp', "$($script:DatabaseContainer):$containerPath", $target) 'Copying the backup out of the container failed.'
        } finally {
            & $docker exec $script:DatabaseContainer rm -f $containerPath | Out-Null
        }
    } else {
        $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
        if ($null -eq $pgDump) { throw 'pg_dump was not found on PATH (needed for an external database).' }
        Invoke-Checked $pgDump.Source @('--dbname', $env:DATABASE_URL, '--format=custom', '--no-owner', '-f', $target) 'pg_dump failed.'
    }

    $size = (Get-Item -LiteralPath $target).Length
    if ($size -le 0) { throw "The backup file is empty: $target" }
    Write-Host ("Backup created: {0} ({1:N0} KB)" -f $target, ($size / 1KB))

    $backups = @(Get-ChildItem -LiteralPath $directory -Filter 'ayscan-*.dump' | Sort-Object LastWriteTime -Descending)
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $expired = @($backups | Select-Object -Skip $KeepMinimum | Where-Object { $_.LastWriteTime -lt $cutoff })
    foreach ($old in $expired) { Remove-Item -LiteralPath $old.FullName -Force }
    if ($expired.Count -gt 0) { Write-Host "Removed $($expired.Count) backup(s) older than $KeepDays days." }

    $logLine = "$(Get-Date -Format 's') OK $fileName $size"
    New-Item -ItemType Directory -Force -Path $script:LogDirectory | Out-Null
    Add-Content -LiteralPath (Join-Path $script:LogDirectory 'backup.log') -Value $logLine
} catch {
    New-Item -ItemType Directory -Force -Path $script:LogDirectory | Out-Null
    Add-Content -LiteralPath (Join-Path $script:LogDirectory 'backup.log') -Value "$(Get-Date -Format 's') FAILED $($_.Exception.Message)"
    Write-Host "Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
