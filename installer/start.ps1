<#
.SYNOPSIS
  Starts A.Y Scan (database + server) in the background and opens it in the browser.
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

try {
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot 'dist-server\server\index.js'))) { throw 'The server build is missing. Run installer\install.cmd again.' }
    Import-RuntimeEnvironment

    $url = Get-ServerUrl
    if ($null -ne (Get-ServerProcess) -and (Test-ServerHealthy)) {
        Write-Host "A.Y Scan is already running at $url"
    } else {
        Start-Database
        New-Item -ItemType Directory -Force -Path $script:LogDirectory, $script:RunDirectory | Out-Null
        $node = Get-NodeCommand
        $startOptions = @{
            FilePath = $node
            ArgumentList = 'dist-server/server/index.js'
            WorkingDirectory = $script:ProjectRoot
            RedirectStandardOutput = (Join-Path $script:LogDirectory 'server.log')
            RedirectStandardError = (Join-Path $script:LogDirectory 'server-error.log')
            PassThru = $true
        }
        if (Test-IsWindowsHost) { $startOptions['WindowStyle'] = 'Hidden' }
        $process = Start-Process @startOptions
        Set-Content -LiteralPath $script:PidFile -Value $process.Id -Encoding ASCII

        $deadline = (Get-Date).AddSeconds(60)
        while (-not (Test-ServerHealthy)) {
            if ($process.HasExited -or (Get-Date) -gt $deadline) {
                $errors = ''
                $errorLog = Join-Path $script:LogDirectory 'server-error.log'
                if (Test-Path -LiteralPath $errorLog) { $errors = (Get-Content -LiteralPath $errorLog -Tail 20 | Out-String).Trim() }
                throw "The server did not start. See logs\server-error.log.`n$errors"
            }
            Start-Sleep -Milliseconds 500
        }
        Write-Host "A.Y Scan is running at $url"
    }
    if (-not $NoBrowser -and (Test-IsWindowsHost)) { Start-Process $url | Out-Null }
} catch {
    Write-Host "Could not start A.Y Scan: $($_.Exception.Message)" -ForegroundColor Red
    if ($Host.Name -eq 'ConsoleHost' -and (Test-IsWindowsHost)) { Read-Host 'Press Enter to close' | Out-Null }
    exit 1
}
