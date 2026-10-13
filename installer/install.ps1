<#
.SYNOPSIS
  Installs (or upgrades) A.Y Scan on this computer.

.DESCRIPTION
  - Checks Node.js and Docker, creates .env with generated secrets (never overwrites existing values).
  - Starts PostgreSQL in Docker (loopback only), builds the app and applies database migrations.
  - Creates the first admin account on a fresh install (the password is never written to disk).
  - On Windows: desktop shortcut, optional start at sign-in, and a daily database backup task.
  Safe to run again to upgrade: data, .env values and backups are kept.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\install.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\install.ps1 -AllowNetworkAccess -Port 8080
#>
[CmdletBinding()]
param(
    [string]$AdminEmail,
    [string]$AdminName,
    [ValidateRange(1, 65535)][int]$Port = 0,
    # Lets other computers on the clinic network open the app (binds 0.0.0.0 and opens the Windows firewall port).
    [switch]$AllowNetworkAccess,
    # Use an existing PostgreSQL server instead of Docker, e.g. postgresql://user:pass@localhost:5432/ayscan
    [string]$ExternalDatabaseUrl,
    [switch]$NoShortcuts,
    [switch]$NoAutoStart,
    [switch]$NoBackupSchedule,
    # For unattended installs: the admin password is read from the AYSCAN_ADMIN_PASSWORD environment variable.
    [switch]$NonInteractive
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

$KnownDefaultPassword = 'change-me-development-only'
$MinimumNode = [Version]'20.19.0'

function Assert-Node {
    $node = Get-NodeCommand
    $versionText = (& $node --version | Select-Object -First 1).ToString().TrimStart('v')
    $version = [Version]($versionText -replace '[^0-9.].*$', '')
    if ($version -lt $MinimumNode) { throw "Node.js $MinimumNode or newer is required (found $versionText). Install the current LTS from https://nodejs.org." }
    Write-Host "Node.js $versionText"
}

function ConvertFrom-SecureText([System.Security.SecureString]$Secure) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Test-PasswordPolicy([string]$Password) {
    return $Password.Length -ge 10 -and $Password.Length -le 200 -and $Password -match '\d' -and $Password -match '[A-Za-z؀-ۿ]'
}

function Read-AdminPassword {
    if ($NonInteractive) {
        $password = $env:AYSCAN_ADMIN_PASSWORD
        if (-not (Test-PasswordPolicy $password)) { throw 'AYSCAN_ADMIN_PASSWORD must be at least 10 characters with letters and digits.' }
        return $password
    }
    while ($true) {
        $first = ConvertFrom-SecureText (Read-Host 'Admin password (10+ characters, letters and digits)' -AsSecureString)
        if (-not (Test-PasswordPolicy $first)) { Write-Warning 'The password must be at least 10 characters and contain letters and digits.'; continue }
        $second = ConvertFrom-SecureText (Read-Host 'Repeat the admin password' -AsSecureString)
        if ($first -ne $second) { Write-Warning 'The passwords do not match.'; continue }
        return $first
    }
}

# Creates .env on first install and fills in anything an older version did not have, without touching existing values.
function Initialize-Environment {
    $isNew = -not (Test-Path -LiteralPath $script:EnvFile)
    if ($isNew) {
        Copy-Item -LiteralPath (Join-Path $script:ProjectRoot '.env.example') -Destination $script:EnvFile
        Write-Host 'Created .env'
    } else {
        Write-Host 'Keeping the existing .env (missing settings are added).'
    }
    $current = Read-DotEnv
    $updates = @{}

    if ($ExternalDatabaseUrl) {
        $updates['USE_DOCKER_DATABASE'] = 'false'
        $updates['DATABASE_URL'] = $ExternalDatabaseUrl
    } elseif ($current['USE_DOCKER_DATABASE'] -ne 'false') {
        $updates['USE_DOCKER_DATABASE'] = 'true'
        # Installs made before v1.0 used the compose defaults ayscan_dev/ayscan_dev and a fixed development password.
        $legacyInstall = -not $isNew -and [string]::IsNullOrWhiteSpace($current['POSTGRES_USER'])
        $user = if ($legacyInstall) { 'ayscan_dev' } elseif ($current['POSTGRES_USER']) { $current['POSTGRES_USER'] } else { 'ayscan' }
        $database = if ($legacyInstall) { 'ayscan_dev' } elseif ($current['POSTGRES_DB']) { $current['POSTGRES_DB'] } else { 'ayscan' }
        $password = $current['POSTGRES_PASSWORD']
        if ([string]::IsNullOrWhiteSpace($password)) { $password = if ($legacyInstall) { $KnownDefaultPassword } else { New-RandomSecret } }
        $databasePort = if ($current['POSTGRES_PORT']) { $current['POSTGRES_PORT'] } else { '55433' }
        $updates['POSTGRES_USER'] = $user
        $updates['POSTGRES_DB'] = $database
        $updates['POSTGRES_PASSWORD'] = $password
        $updates['POSTGRES_PORT'] = $databasePort
        $updates['DATABASE_URL'] = "postgresql://${user}:${password}@127.0.0.1:${databasePort}/${database}"
    }

    if ($Port -gt 0) { $updates['PORT'] = "$Port" } elseif (-not $current['PORT']) { $updates['PORT'] = '3001' }
    if ($AllowNetworkAccess) { $updates['HOST'] = '0.0.0.0' } elseif (-not $current['HOST']) { $updates['HOST'] = '127.0.0.1' }
    foreach ($pair in @(@('NODE_ENV', 'production'), @('APP_TIMEZONE', 'Africa/Cairo'), @('MIGRATE_ON_START', 'true'), @('ALLOW_IN_MEMORY_STORE', 'false'))) {
        if (-not $current[$pair[0]]) { $updates[$pair[0]] = $pair[1] }
    }
    # Settings from older versions that no longer exist; blank them so nobody relies on them.
    foreach ($obsolete in @('AUTH_REQUIRED', 'AUTH_TOKEN_SECRET', 'AUTH_ADMIN_ROLE', 'AUTH_ADMIN_PASSWORD')) {
        if ($current.Contains($obsolete) -and $current[$obsolete]) { $updates[$obsolete] = '' }
    }
    Set-DotEnvValues $updates
    Import-DotEnv | Out-Null
}

# Replaces the well-known development password from older installs with a generated one.
function Update-LegacyDatabasePassword {
    if (-not (Test-UsesDockerDatabase) -or $env:POSTGRES_PASSWORD -ne $KnownDefaultPassword) { return }
    Write-Step 'Replacing the default database password with a generated one'
    $newPassword = New-RandomSecret
    $docker = Get-DockerCommand
    Invoke-Checked $docker @('exec', $script:DatabaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $env:POSTGRES_USER, '-d', $env:POSTGRES_DB, '-c', "ALTER USER `"$($env:POSTGRES_USER)`" WITH PASSWORD '$newPassword'") 'Could not rotate the database password.'
    Set-DotEnvValues @{ POSTGRES_PASSWORD = $newPassword; DATABASE_URL = "postgresql://$($env:POSTGRES_USER):${newPassword}@127.0.0.1:$($env:POSTGRES_PORT)/$($env:POSTGRES_DB)" }
    Import-DotEnv | Out-Null
}

function Initialize-AdminAccount([string]$Node) {
    & $Node 'dist-server/server/create-admin.js' '--check' | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host 'User accounts already exist; skipping admin creation.'; return $null }
    if ($LASTEXITCODE -ne 3) { throw 'Could not check existing user accounts.' }

    Write-Step 'Create the administrator account'
    $email = $AdminEmail
    while ([string]::IsNullOrWhiteSpace($email) -or $email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
        if ($NonInteractive) { throw 'Pass -AdminEmail for unattended installs.' }
        $email = Read-Host 'Admin email (used to sign in)'
    }
    $name = $AdminName
    if ([string]::IsNullOrWhiteSpace($name)) { $name = if ($NonInteractive) { 'Administrator' } else { Read-Host 'Admin display name (e.g. Dr. Ahmed)' } }
    if ([string]::IsNullOrWhiteSpace($name)) { $name = 'Administrator' }
    $password = Read-AdminPassword

    $env:AUTH_ADMIN_EMAIL = $email.Trim()
    $env:AUTH_ADMIN_DISPLAY_NAME = $name.Trim()
    $env:AUTH_ADMIN_PASSWORD = $password
    try {
        Invoke-Checked $Node @('dist-server/server/create-admin.js') 'Could not create the admin account.' | Out-Host
    } finally {
        Remove-Item Env:\AUTH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
        $password = $null
    }
    return $email.Trim()
}

function New-Shortcut([string]$Path, [string]$Target, [string]$Arguments, [string]$Description) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $Target
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $script:ProjectRoot
    $shortcut.Description = $Description
    $icon = Join-Path $script:ProjectRoot 'installer\ay-scan.ico'
    if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = $icon }
    $shortcut.Save()
}

function Install-WindowsIntegration {
    if (-not (Test-IsWindowsHost)) { Write-Host 'Not Windows: skipping shortcuts, auto-start and scheduled backups.'; return }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $startArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'start.ps1')`""
    if (-not $NoShortcuts) {
        New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'A.Y Scan.lnk') $powershell $startArguments 'Start A.Y Scan and open it in the browser'
        New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'A.Y Scan - Stop.lnk') $powershell "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'stop.ps1')`"" 'Stop A.Y Scan'
        Write-Host 'Desktop shortcuts created.'
    }
    $startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'A.Y Scan.lnk'
    if ($NoAutoStart) {
        Remove-Item -LiteralPath $startupShortcut -ErrorAction SilentlyContinue
    } else {
        New-Shortcut $startupShortcut $powershell "$startArguments -NoBrowser" 'Start A.Y Scan when you sign in'
        Write-Host 'A.Y Scan will start automatically when you sign in to Windows.'
    }
    if (-not $NoBackupSchedule) {
        try {
            $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'backup.ps1')`""
            $trigger = New-ScheduledTaskTrigger -Daily -At '22:00'
            $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
            Register-ScheduledTask -TaskName 'A.Y Scan daily backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily PostgreSQL backup of A.Y Scan' -Force | Out-Null
            Write-Host 'Daily database backup scheduled at 22:00 (missed runs execute at next sign-in).'
        } catch {
            Write-Warning "Could not schedule the daily backup: $($_.Exception.Message). Run installer\backup.ps1 manually."
        }
    }
    if ($AllowNetworkAccess) {
        try {
            $ruleName = "A.Y Scan (TCP $($env:PORT))"
            if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $env:PORT -Action Allow -Profile Private, Domain | Out-Null
            }
            Write-Host "Firewall opened for TCP $($env:PORT) on private networks."
        } catch {
            Write-Warning "Could not open the firewall port (run the installer as Administrator once): $($_.Exception.Message)"
        }
    }
}

try {
    Write-Step 'Checking prerequisites'
    Assert-Node
    Select-Pnpm

    Write-Step 'Preparing configuration (.env)'
    Initialize-Environment
    if (Test-UsesDockerDatabase) { Wait-DockerEngine; Write-Host 'Docker is running.' }

    $server = Get-ServerProcess
    if ($null -ne $server) {
        Write-Step 'Stopping the running A.Y Scan server for the upgrade'
        Stop-Process -Id $server.Id -Force
        Remove-Item -LiteralPath $script:PidFile -ErrorAction SilentlyContinue
    }

    Write-Step 'Installing dependencies'
    Invoke-Pnpm @('install', '--frozen-lockfile')

    Write-Step 'Building the application'
    Invoke-Pnpm @('build')
    Invoke-Pnpm @('server:build')

    if (Test-UsesDockerDatabase) {
        Write-Step 'Starting PostgreSQL (Docker)'
        Start-Database
        Update-LegacyDatabasePassword
    }

    Write-Step 'Applying database migrations'
    $node = Get-NodeCommand
    Invoke-Checked $node @('dist-server/server/migrate.js') 'Database migration failed.'

    $createdAdmin = Initialize-AdminAccount $node

    Write-Step 'Windows integration'
    Install-WindowsIntegration

    New-Item -ItemType Directory -Force -Path $script:LogDirectory, $script:RunDirectory, (Join-Path $script:ProjectRoot 'backups') | Out-Null

    Write-Host ''
    Write-Host 'A.Y Scan is installed.' -ForegroundColor Green
    Write-Host "  Open:        $(Get-ServerUrl)"
    if ($createdAdmin) { Write-Host "  Sign in as:  $createdAdmin" }
    if ($env:HOST -eq '0.0.0.0') { Write-Host "  Network:     other computers can use http://<this-computer-name>:$($env:PORT)" }
    Write-Host "  Backups:     $(Join-Path $script:ProjectRoot 'backups')"
    Write-Host '  Start:       desktop shortcut "A.Y Scan" or installer\start.cmd'
} catch {
    Write-Host ''
    Write-Host "Installation stopped: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
