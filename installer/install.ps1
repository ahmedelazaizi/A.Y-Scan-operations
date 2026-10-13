[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $ProjectRoot

$script:PnpmCommand = $null
$script:PnpmPrefix = @()

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage Exit code: $LASTEXITCODE."
    }
}

function Invoke-Pnpm {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & $script:PnpmCommand @($script:PnpmPrefix + $Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm command failed: $($Arguments -join ' '). Exit code: $LASTEXITCODE."
    }
}

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

function Set-LocalDatabaseUrl {
    $postgresPort = $env:POSTGRES_PORT
    if ([string]::IsNullOrWhiteSpace($postgresPort)) {
        $postgresPort = '55433'
    }

    if ($env:DATABASE_URL -match '@localhost:5432/' -and $postgresPort -ne '5432') {
        $env:DATABASE_URL = $env:DATABASE_URL -replace '@localhost:5432/', "@localhost:$postgresPort/"
        Write-Warning "DATABASE_URL used the .env.example localhost:5432 value; this run uses the Docker host port $postgresPort without changing .env."
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
        throw 'pnpm was not found. Install Node.js with Corepack support or install pnpm, then run this script again.'
    }

    $script:PnpmCommand = $pnpm.Source
}

try {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        throw 'Node.js was not found. Install Node.js 20 or newer and run this script again.'
    }

    $nodeVersionOutput = (& $node.Source --version | Select-Object -First 1).ToString()
    $nodeVersionMatch = [regex]::Match($nodeVersionOutput, '^v?(\d+)')
    if (-not $nodeVersionMatch.Success -or [int]$nodeVersionMatch.Groups[1].Value -lt 20) {
        throw "Node.js 20 or newer is required. Detected: $nodeVersionOutput"
    }
    Write-Host "Node.js check passed: $nodeVersionOutput"

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) {
        throw 'Docker CLI was not found. Install Docker Desktop or Docker CLI, then run this script again.'
    }
    Invoke-CheckedCommand $docker.Source @('version', '--format', '{{.Client.Version}}') 'Docker CLI check failed.'
    Invoke-CheckedCommand $docker.Source @('info', '--format', '{{.ServerVersion}}') 'Docker daemon is not available. Start Docker Desktop and run this script again.'
    Invoke-CheckedCommand $docker.Source @('compose', 'version') 'Docker Compose is not available through the Docker CLI.'

    Select-Pnpm
    Write-Host 'Using pnpm through Corepack when available.'

    if (-not (Test-Path -LiteralPath '.env')) {
        if (-not (Test-Path -LiteralPath '.env.example')) {
            throw '.env.example was not found; cannot create the local environment file.'
        }
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Host 'Created .env from .env.example. Existing .env files are never overwritten.'
    } else {
        Write-Host 'Using the existing .env without overwriting it.'
    }

    Import-DotEnvFile '.env'
    Set-LocalDatabaseUrl
    if ($env:AUTH_REQUIRED -and $env:AUTH_REQUIRED.Trim().ToLowerInvariant() -eq 'true') {
        if ([string]::IsNullOrWhiteSpace($env:AUTH_ADMIN_PASSWORD) -or [string]::IsNullOrWhiteSpace($env:AUTH_TOKEN_SECRET)) {
            Write-Warning 'AUTH_REQUIRED=true: set AUTH_ADMIN_PASSWORD and AUTH_TOKEN_SECRET in .env before using authenticated routes.'
        }
    }

    Write-Host 'Installing dependencies from pnpm-lock.yaml...'
    Invoke-Pnpm @('install', '--frozen-lockfile')

    Write-Host 'Starting PostgreSQL project ay-scan-local-v2...'
    Invoke-Pnpm @('db:up')

    $healthDeadline = (Get-Date).AddSeconds(120)
    $healthStatus = ''
    while ((Get-Date) -lt $healthDeadline) {
        $healthOutput = & $docker.Source inspect '--format' '{{.State.Health.Status}}' 'ay-scan-postgres-v2' 2>$null | Select-Object -First 1
        if ($null -eq $healthOutput) {
            $healthStatus = ''
        } else {
            $healthStatus = $healthOutput.ToString().Trim()
        }
        if ($healthStatus -eq 'healthy') {
            break
        }
        if ($healthStatus -eq 'unhealthy') {
            break
        }
        Start-Sleep -Seconds 3
    }

    if ($healthStatus -ne 'healthy') {
        $recentLogs = ((& $docker.Source logs '--tail' '40' 'ay-scan-postgres-v2' 2>&1 | Out-String).Trim())
        throw "PostgreSQL did not become healthy within 120 seconds. Last status: '$healthStatus'. Recent container logs:`n$recentLogs"
    }
    Write-Host 'PostgreSQL health check passed.'

    foreach ($migrationScript in @('db:migrate', 'db:migrate:lab', 'db:migrate:auth', 'db:migrate:billing', 'db:migrate:radiology', 'db:migrate:inventory', 'db:migrate:insurance', 'db:migrate:home-visits')) {
        Write-Host "Applying $migrationScript..."
        Invoke-Pnpm @($migrationScript)
    }

    Write-Host 'Building frontend...'
    Invoke-Pnpm @('build')
    Write-Host 'Building server...'
    Invoke-Pnpm @('server:build')

    Write-Host 'Installation completed. No Docker volumes were removed.'
    Write-Host 'If AUTH_REQUIRED=true, set AUTH_ADMIN_PASSWORD and AUTH_TOKEN_SECRET in .env before starting the server.'
    Write-Host 'Run: pwsh -ExecutionPolicy Bypass -File .\installer\start.ps1'
} catch {
    Write-Error "Local installation stopped: $($_.Exception.Message)"
    exit 1
}
