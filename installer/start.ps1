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

    # A previous start may have moved to another port because the preferred one was taken; the server it left running keeps it.
    if (($null -ne (Get-ServerProcess)) -and (Test-Path -LiteralPath $script:PortFile)) {
        $recorded = (Get-Content -LiteralPath $script:PortFile -Raw).Trim()
        if ($recorded -match '^\d+$') { $env:PORT = $recorded }
    }
    $url = Get-ServerUrl
    if ($null -ne (Get-ServerProcess) -and (Test-ServerHealthy)) {
        Write-Host "A.Y Scan is already running at $url"
    } else {
        $wantedPort = [int]((Get-ServerUrl) -replace '^.*:', '')
        if (-not (Test-PortFree $wantedPort)) {
            $chosenPort = Find-FreePort ($wantedPort + 1)
            Write-Host "Port $wantedPort is used by another program; A.Y Scan will use port $chosenPort instead."
            $env:PORT = "$chosenPort"
        }
        $url = Get-ServerUrl
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

        # First start creates the database cluster and applies all migrations, which can take a few minutes on a slow disk.
        $deadline = (Get-Date).AddSeconds(240)
        while (-not (Test-ServerHealthy)) {
            if ($process.HasExited -or (Get-Date) -gt $deadline) {
                $errors = ''
                $errorLog = Join-Path $script:LogDirectory 'server-error.log'
                if (Test-Path -LiteralPath $errorLog) { $errors = (Get-Content -LiteralPath $errorLog -Tail 20 | Out-String).Trim() }
                throw "The server did not start. See logs\server-error.log.`n$errors"
            }
            Start-Sleep -Milliseconds 500
        }
        Set-Content -LiteralPath $script:PortFile -Value $env:PORT -Encoding ASCII
        Write-Host "A.Y Scan is running at $url"
    }
    if (-not $NoBrowser) { Open-AppWindow $url }
} catch {
    Write-Host "Could not start A.Y Scan: $($_.Exception.Message)" -ForegroundColor Red
    # No 'press Enter' prompt here: the AYScan.exe launcher shows this message in a dialog, and start.cmd pauses by itself.
    exit 1
}
