<#
.SYNOPSIS
  Stops the A.Y Scan server and its database container. Data volumes are never removed.
#>
[CmdletBinding()]
param(
    # Stop only the web server and leave PostgreSQL running.
    [switch]$ServerOnly
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

try {
    if (Test-Path -LiteralPath $script:EnvFile) { Import-DotEnv | Out-Null }
    $server = Get-ServerProcess
    if ($null -ne $server) {
        Stop-Process -Id $server.Id -Force
        Write-Host 'A.Y Scan server stopped.'
    } else {
        Write-Host 'The A.Y Scan server was not running.'
    }
    Remove-Item -LiteralPath $script:PidFile -ErrorAction SilentlyContinue

    if (-not $ServerOnly -and (Test-UsesDockerDatabase)) {
        Invoke-Compose @('stop', 'ay-scan-postgres')
        Write-Host 'PostgreSQL stopped (data kept).'
    }
} catch {
    Write-Host "Could not stop A.Y Scan: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
