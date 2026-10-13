[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $ProjectRoot

$script:PnpmCommand = $null
$script:PnpmPrefix = @()

function Select-Pnpm {
    $corepack = Get-Command corepack -ErrorAction SilentlyContinue
    if ($null -ne $corepack) {
        & $corepack.Source pnpm --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $script:PnpmCommand = $corepack.Source
            $script:PnpmPrefix = @('pnpm')
            return
        }
    }

    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($null -eq $pnpm) {
        throw 'pnpm was not found. Install Node.js with Corepack support or pnpm, then run this script again.'
    }
    $script:PnpmCommand = $pnpm.Source
}

try {
    Select-Pnpm
    Write-Host 'Stopping the ay-scan-local-v2 PostgreSQL service without removing volumes...'
    & $script:PnpmCommand @($script:PnpmPrefix + @('db:down'))
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm db:down failed. Exit code: $LASTEXITCODE."
    }
    Write-Host 'PostgreSQL service stopped. Docker volumes were not removed.'
} catch {
    Write-Error "Stop stopped: $($_.Exception.Message)"
    exit 1
}
