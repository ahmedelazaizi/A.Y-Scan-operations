[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $ProjectRoot

$script:PnpmCommand = $null
$script:PnpmPrefix = @()

function Import-DotEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmedLine = $line.Trim()
        if ($trimmedLine.Length -eq 0 -or $trimmedLine.StartsWith('#')) {
            continue
        }
        $separatorIndex = $trimmedLine.IndexOf('=')
        if ($separatorIndex -lt 1) {
            continue
        }
        $name = $trimmedLine.Substring(0, $separatorIndex).Trim()
        $value = $trimmedLine.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

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
        throw 'pnpm was not found. Run the install script after installing Node.js with Corepack support or pnpm.'
    }
    $script:PnpmCommand = $pnpm.Source
}

function Invoke-Pnpm {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & $script:PnpmCommand @($script:PnpmPrefix + $Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm command failed: $($Arguments -join ' '). Exit code: $LASTEXITCODE."
    }
}

try {
    if (-not (Test-Path -LiteralPath '.env')) {
        throw '.env was not found. Run .\installer\install.ps1 first so the local environment is prepared.'
    }
    if (-not (Test-Path -LiteralPath 'dist\index.html')) {
        throw 'Frontend build is missing at dist\index.html. Run .\installer\install.ps1 or pnpm build first.'
    }
    if (-not (Test-Path -LiteralPath 'dist-server\server\index.js')) {
        throw 'Server build is missing at dist-server\server\index.js. Run .\installer\install.ps1 or pnpm server:build first.'
    }

    Import-DotEnvFile '.env'
    $postgresPort = if ([string]::IsNullOrWhiteSpace($env:POSTGRES_PORT)) { '55433' } else { $env:POSTGRES_PORT }
    if ($env:DATABASE_URL -match '@localhost:5432/' -and $postgresPort -ne '5432') {
        $env:DATABASE_URL = $env:DATABASE_URL -replace '@localhost:5432/', "@localhost:$postgresPort/"
        Write-Warning "DATABASE_URL used the .env.example localhost:5432 value; this run uses the Docker host port $postgresPort without changing .env."
    }

    $portText = if ([string]::IsNullOrWhiteSpace($env:PORT)) { '3001' } else { $env:PORT }
    $port = 0
    if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        throw "PORT must be a number between 1 and 65535. Detected: $portText"
    }

    Select-Pnpm
    Write-Host "Frontend development URL: http://localhost:5173"
    Write-Host "Frontend preview URL after 'pnpm preview': http://localhost:4173"
    Write-Host "API URL: http://localhost:$port"
    Write-Host "API health: http://localhost:$port/api/health"
    Write-Host 'The API will run in this terminal. Press Ctrl+C to stop it; use installer\stop.ps1 to stop PostgreSQL.'

    Invoke-Pnpm @('server:start')
} catch {
    Write-Error "Server start stopped: $($_.Exception.Message)"
    exit 1
}
