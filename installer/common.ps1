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
$script:PortFile = Join-Path $script:RunDirectory 'port.txt'
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

# Get-Command can return several matches for one tool on Windows (tool.cmd and tool.ps1). Pick exactly one real
# executable, preferring .cmd/.exe so that no PowerShell script (and no execution policy) is involved.
function Find-Tool([string]$Name) {
    foreach ($candidate in @("$Name.cmd", "$Name.exe", $Name)) {
        $found = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $found) { return [string]$found.Source }
    }
    return $null
}

function Select-Pnpm {
    $pnpm = Find-Tool 'pnpm'
    if ($null -ne $pnpm) {
        $script:PnpmCommand = $pnpm
        $script:PnpmPrefix = @()
        return
    }
    $corepack = Find-Tool 'corepack'
    if ($null -ne $corepack) {
        & $corepack pnpm --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $script:PnpmCommand = $corepack
            $script:PnpmPrefix = @('pnpm')
            return
        }
    }
    throw 'pnpm was not found. Install it with: npm install -g pnpm@10.28.0  (then open a new PowerShell window).'
}

function Invoke-Pnpm([string[]]$Arguments) {
    if ($null -eq $script:PnpmCommand) { Select-Pnpm }
    $allArguments = @($script:PnpmPrefix) + @($Arguments)
    Write-Host "> $script:PnpmCommand $($allArguments -join ' ')" -ForegroundColor DarkGray
    & $script:PnpmCommand @allArguments
    if ($LASTEXITCODE -ne 0) { throw "pnpm $($Arguments -join ' ') failed (exit code $LASTEXITCODE)." }
}

# Node.js bundled by the Windows installer (runtime\node), preferred over any node on PATH.
function Get-BundledNode {
    foreach ($name in @('node.exe', 'node')) {
        $candidate = Join-Path $script:ProjectRoot (Join-Path 'runtime' (Join-Path 'node' $name))
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Get-NodeCommand {
    $bundled = Get-BundledNode
    if ($null -ne $bundled) { return $bundled }
    $node = Find-Tool 'node'
    if ($null -eq $node) { throw 'Node.js was not found. Install Node.js 20.19 or newer (LTS) from https://nodejs.org and run the installer again.' }
    return $node
}

# True when the server manages the PostgreSQL bundled with the installer (EMBEDDED_PG=true in .env).
function Test-EmbeddedDatabase {
    return ([Environment]::GetEnvironmentVariable('EMBEDDED_PG', 'Process') -eq 'true')
}

function Test-UsesDockerDatabase {
    if (Test-EmbeddedDatabase) { return $false }
    return ([Environment]::GetEnvironmentVariable('USE_DOCKER_DATABASE', 'Process') -ne 'false')
}

function Resolve-ProjectPath([string]$Path) {
    if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
    return (Join-Path $script:ProjectRoot $Path)
}

function Get-PgTool([string]$Name) {
    $binDir = Resolve-ProjectPath $env:PG_BIN_DIR
    foreach ($candidate in @("$Name.exe", $Name)) {
        $path = Join-Path $binDir $candidate
        if (Test-Path -LiteralPath $path) { return $path }
    }
    throw "PostgreSQL tool '$Name' was not found in $binDir."
}

function Get-EmbeddedDataDirectory {
    $dir = if ($env:PG_DATA_DIR) { $env:PG_DATA_DIR } else { 'data\pgdata' }
    return (Resolve-ProjectPath $dir)
}

function Get-EmbeddedCredentials {
    $file = Join-Path (Split-Path (Get-EmbeddedDataDirectory) -Parent) 'pg-credentials.json'
    if (-not (Test-Path -LiteralPath $file)) { throw "The database has not been created yet (missing $file). Start A.Y Scan once first." }
    $credentials = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    return $credentials
}

function Test-EmbeddedDatabaseRunning {
    & (Get-PgTool 'pg_ctl') status -D (Get-EmbeddedDataDirectory) *> $null
    return $LASTEXITCODE -eq 0
}

# Starts the bundled PostgreSQL when it is not running (used by backup/restore while the app is stopped).
# Returns $true when this call started it, so the caller can stop it again.
function Start-EmbeddedDatabaseIfNeeded {
    if (Test-EmbeddedDatabaseRunning) { return $false }
    $credentials = Get-EmbeddedCredentials
    $dataDir = Get-EmbeddedDataDirectory
    $logFile = Join-Path (Split-Path $dataDir -Parent) 'postgres.log'
    Invoke-Checked (Get-PgTool 'pg_ctl') @('start', '-D', $dataDir, '-w', '-t', '60', '-l', $logFile, '-o', "-p $($credentials.port) -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c max_connections=60") 'Could not start the local database.'
    return $true
}

function Stop-EmbeddedDatabase {
    if (Test-EmbeddedDatabaseRunning) { & (Get-PgTool 'pg_ctl') stop -D (Get-EmbeddedDataDirectory) -m fast -w -t 30 | Out-Null }
}

# Runs a PostgreSQL client tool (pg_dump, pg_restore) against the bundled database; the password never appears on the command line.
function Invoke-EmbeddedPg([string]$Tool, [string[]]$Arguments, [string]$FailureMessage) {
    $credentials = Get-EmbeddedCredentials
    $previous = $env:PGPASSWORD
    $env:PGPASSWORD = $credentials.password
    try {
        Invoke-Checked (Get-PgTool $Tool) (@('-h', '127.0.0.1', '-p', "$($credentials.port)", '-U', $credentials.user) + $Arguments) $FailureMessage
    } finally {
        if ($null -eq $previous) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previous }
    }
}

function Get-DockerCommand {
    $docker = Find-Tool 'docker'
    if ($null -eq $docker) { throw 'Docker was not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop) or rerun the installer with -ExternalDatabaseUrl.' }
    return $docker
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
    if ([string]::IsNullOrWhiteSpace($port)) { $port = '8741' }
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

# The Windows installer layout ships its own PostgreSQL under runtime\pgsql.
function Test-BundledLayout {
    return (Test-Path -LiteralPath (Join-Path (Join-Path $script:ProjectRoot 'runtime') 'pgsql'))
}

# Loads the settings every script needs. In the bundled layout the defaults below apply even when .env is missing,
# so a lost or unwritten .env can never leave the app unable to start; values in .env override them.
function Import-RuntimeEnvironment {
    if (Test-BundledLayout) {
        $defaults = [ordered]@{
            PORT = '8741'; HOST = '127.0.0.1'; NODE_ENV = 'production'; APP_TIMEZONE = 'Africa/Cairo'; MIGRATE_ON_START = 'true'
            EMBEDDED_PG = 'true'; PG_BIN_DIR = 'runtime/pgsql/bin'; PG_DATA_DIR = 'data/pgdata'; PG_PORT = '55432'; WEB_ROOT = 'dist'
        }
        foreach ($key in $defaults.Keys) { [Environment]::SetEnvironmentVariable($key, $defaults[$key], 'Process') }
    }
    if (Test-Path -LiteralPath $script:EnvFile) {
        Import-DotEnv | Out-Null
    } elseif (-not (Test-BundledLayout)) {
        throw 'A.Y Scan is not installed yet (.env is missing). Run installer\install.cmd first.'
    }
}

# Opens the app in its own window (no address bar) with Edge or Chrome when present, otherwise in the default browser.
function Open-AppWindow([string]$Url) {
    if (-not (Test-IsWindowsHost)) { return }
    foreach ($browser in @('msedge.exe', 'chrome.exe')) {
        try {
            Start-Process -FilePath $browser -ArgumentList "--app=$Url" -ErrorAction Stop | Out-Null
            return
        } catch {
            continue
        }
    }
    Start-Process $Url | Out-Null
}

# True when nothing is listening on the TCP port (checked on all addresses, so a program bound only to 127.0.0.1 counts too).
function Test-PortFree([int]$Port) {
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $listener) { $listener.Stop() }
    }
}

function Find-FreePort([int]$Preferred) {
    for ($candidate = $Preferred; $candidate -lt ($Preferred + 100); $candidate++) {
        if (Test-PortFree $candidate) { return $candidate }
    }
    throw "No free TCP port was found starting at $Preferred."
}
