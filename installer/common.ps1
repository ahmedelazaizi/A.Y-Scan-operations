# Shared helpers for the A.Y Scan installer scripts. Dot-source this file: . "$PSScriptRoot\common.ps1"
# Compatible with Windows PowerShell 5.1 and PowerShell 7+.

$ErrorActionPreference = 'Stop'
$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:EnvFile = Join-Path $script:ProjectRoot '.env'
$script:ComposeProject = 'ay-scan-local-v2'
$script:DatabaseContainer = 'ay-scan-postgres-v2'
$script:RunDirectory = Join-Path $script:ProjectRoot 'run'
$script:LogDirectory = Join-Path $script:ProjectRoot 'logs'
$script:PidFile = Join-Path $script:RunDirectory 'server.pid'
$script:PnpmCommand = $null
$script:PnpmPrefix = @()

function Test-IsWindowsHost {
    if ($PSVersionTable.PSEdition -eq 'Desktop') { return $true }
    return [bool](Get-Variable -Name IsWindows -ValueOnly -ErrorAction SilentlyContinue)
}

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FailureMessage (exit code $LASTEXITCODE)" }
}

function Read-DotEnv([string]$Path = $script:EnvFile) {
    $values = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
    }
    return $values
}

function Import-DotEnv([string]$Path = $script:EnvFile) {
    $values = Read-DotEnv $Path
    foreach ($key in $values.Keys) { [Environment]::SetEnvironmentVariable($key, $values[$key], 'Process') }
    return $values
}

# Rewrites KEY=value lines in place (keeping comments and order) and appends keys that are missing.
function Set-DotEnvValues([hashtable]$Values, [string]$Path = $script:EnvFile) {
    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $Path) { foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) { $lines.Add($line) } }
    $pending = @{} + $Values
    for ($index = 0; $index -lt $lines.Count; $index++) {
        $match = [regex]::Match($lines[$index], '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=')
        if ($match.Success -and $pending.ContainsKey($match.Groups[1].Value)) {
            $key = $match.Groups[1].Value
            $lines[$index] = "$key=$($pending[$key])"
            $pending.Remove($key)
        }
    }
    foreach ($key in ($pending.Keys | Sort-Object)) { $lines.Add("$key=$($pending[$key])") }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, (($lines -join "`n") + "`n"), $utf8NoBom)
}

function New-RandomSecret([int]$Bytes = 24) {
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
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
    if ($null -eq $pnpm) { throw 'pnpm was not found. Install Node.js 20.19+ (it includes Corepack) and run the installer again.' }
    $script:PnpmCommand = $pnpm.Source
    $script:PnpmPrefix = @()
}

function Invoke-Pnpm([string[]]$Arguments) {
    if ($null -eq $script:PnpmCommand) { Select-Pnpm }
    & $script:PnpmCommand @($script:PnpmPrefix + $Arguments)
    if ($LASTEXITCODE -ne 0) { throw "pnpm $($Arguments -join ' ') failed (exit code $LASTEXITCODE)." }
}

function Get-NodeCommand {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) { throw 'Node.js was not found. Install Node.js 20.19 or newer (LTS) from https://nodejs.org and run the installer again.' }
    return $node.Source
}

function Test-UsesDockerDatabase {
    return ([Environment]::GetEnvironmentVariable('USE_DOCKER_DATABASE', 'Process') -ne 'false')
}

function Get-DockerCommand {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) { throw 'Docker was not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop) or rerun the installer with -ExternalDatabaseUrl.' }
    return $docker.Source
}

# Waits for the Docker engine, starting Docker Desktop on Windows when it is installed but not running.
function Wait-DockerEngine([int]$TimeoutSeconds = 180) {
    $docker = Get-DockerCommand
    & $docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -eq 0) { return }
    if (Test-IsWindowsHost) {
        $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (Test-Path -LiteralPath $desktop) {
            Write-Host 'Starting Docker Desktop...'
            Start-Process -FilePath $desktop | Out-Null
        }
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        & $docker info --format '{{.ServerVersion}}' *> $null
        if ($LASTEXITCODE -eq 0) { return }
    }
    throw "Docker is not running. Start Docker Desktop and try again."
}

function Invoke-Compose([string[]]$Arguments) {
    $docker = Get-DockerCommand
    Push-Location $script:ProjectRoot
    try {
        Invoke-Checked $docker (@('compose', '-p', $script:ComposeProject) + $Arguments) "docker compose $($Arguments -join ' ') failed."
    } finally {
        Pop-Location
    }
}

function Wait-DatabaseHealthy([int]$TimeoutSeconds = 120) {
    $docker = Get-DockerCommand
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $status = ''
    while ((Get-Date) -lt $deadline) {
        $output = & $docker inspect --format '{{.State.Health.Status}}' $script:DatabaseContainer 2>$null | Select-Object -First 1
        $status = if ($null -eq $output) { '' } else { $output.ToString().Trim() }
        if ($status -eq 'healthy') { return }
        if ($status -eq 'unhealthy') { break }
        Start-Sleep -Seconds 2
    }
    $logs = (& $docker logs --tail 30 $script:DatabaseContainer 2>&1 | Out-String).Trim()
    throw "PostgreSQL did not become healthy (last status: '$status'). Recent logs:`n$logs"
}

function Start-Database {
    if (-not (Test-UsesDockerDatabase)) { return }
    Wait-DockerEngine
    Invoke-Compose @('up', '-d', 'ay-scan-postgres')
    Wait-DatabaseHealthy
}

function Get-ServerUrl {
    $port = [Environment]::GetEnvironmentVariable('PORT', 'Process')
    if ([string]::IsNullOrWhiteSpace($port)) { $port = '3001' }
    return "http://localhost:$port"
}

function Test-ServerHealthy {
    try {
        $response = Invoke-WebRequest -Uri "$(Get-ServerUrl)/api/health" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-ServerProcess {
    if (-not (Test-Path -LiteralPath $script:PidFile)) { return $null }
    $serverId = (Get-Content -LiteralPath $script:PidFile -Raw).Trim()
    if (-not ($serverId -match '^\d+$')) { return $null }
    $process = Get-Process -Id ([int]$serverId) -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.ProcessName -notmatch '^node') { return $null }
    return $process
}
