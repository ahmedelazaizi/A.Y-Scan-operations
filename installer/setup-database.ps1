<#
.SYNOPSIS
  Prepares the A.Y Scan database (create it when needed, apply all tables, create the default admin) so the first launch is fast.
  The installer runs this once; it can also be run by hand after changing the database settings in .env.
#>
[CmdletBinding()]
param()

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

try {
    Import-RuntimeEnvironment
    New-Item -ItemType Directory -Force -Path $script:LogDirectory | Out-Null
    $node = Get-NodeCommand
    $outLog = Join-Path $script:LogDirectory 'setup-database.log'
    $errLog = Join-Path $script:LogDirectory 'setup-database-error.log'
    $startOptions = @{
        FilePath = $node
        ArgumentList = 'dist-server/server/setup-database.js'
        WorkingDirectory = $script:ProjectRoot
        RedirectStandardOutput = $outLog
        RedirectStandardError = $errLog
        PassThru = $true
        Wait = $true
    }
    if (Test-IsWindowsHost) { $startOptions['WindowStyle'] = 'Hidden' }
    $process = Start-Process @startOptions
    if ($process.ExitCode -ne 0) {
        $details = ''
        if (Test-Path -LiteralPath $errLog) { $details = (Get-Content -LiteralPath $errLog -Tail 8 | Out-String).Trim() }
        throw "Database setup failed. $details"
    }
    Write-Host 'The database is ready.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
