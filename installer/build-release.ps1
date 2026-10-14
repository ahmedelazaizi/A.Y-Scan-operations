<#
.SYNOPSIS
  Builds the A.Y Scan release: stages the app with its own Node.js and PostgreSQL, then compiles the Inno Setup installer.

.DESCRIPTION
  Run on a Windows developer machine that has Node.js 20.19+ and (for the final step) Inno Setup 6.5+.
  Output: release\AYScan-Setup-<version>.exe  (the installer to run on clinic computers; they need no Node.js or Docker).
  Downloads are verified against pinned SHA-256 values and cached in release\cache.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\build-release.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\installer\build-release.ps1 -SkipInstaller   # stage only, no Inno Setup
#>
[CmdletBinding()]
param(
    [switch]$SkipInstaller,
    # Path to ISCC.exe when Inno Setup is installed somewhere unusual.
    [string]$InnoCompiler
)

. "$PSScriptRoot\common.ps1"
Set-Location -LiteralPath $script:ProjectRoot

# Pinned runtime versions. To upgrade: change the version, the URL and the SHA-256 together.
$NodeVersion = '22.22.0'
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
$NodeSha256 = 'c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a'
$PgVersion = '16.9-1'
$PgZipName = "postgresql-$PgVersion-windows-x64-binaries.zip"
$PgUrl = "https://get.enterprisedb.com/postgresql/$PgZipName"
$PgSha256 = '304eb7dab70717015c4fd09986122e470d53a57a3a2b443d31e2c1d83d88db88'

$FinalOutputDir = Join-Path $script:ProjectRoot 'release'
# Build tools (Expand-Archive, npm, Inno Setup) are most reliable with plain ASCII paths. When the project folder
# has other characters (for example an Arabic folder name), work in a temporary ASCII folder and copy the result back.
$ReleaseRoot = $FinalOutputDir
if ($script:ProjectRoot -match '[^\u0000-\u007F]') {
    $ReleaseRoot = Join-Path $env:LOCALAPPDATA 'AYScanRelease'
    Write-Host "The project path has non-English characters; building in $ReleaseRoot and copying the installer back."
}
$CacheDir = Join-Path $ReleaseRoot 'cache'
$StageDir = Join-Path $ReleaseRoot 'stage'

function Get-VerifiedDownload([string]$Url, [string]$FileName, [string]$ExpectedSha256) {
    # Windows PowerShell 5.1 defaults to old TLS versions that nodejs.org and enterprisedb.com reject.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
    $target = Join-Path $CacheDir $FileName
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "Downloading $FileName ..."
        $previous = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try { Invoke-WebRequest -Uri $Url -OutFile $target -UseBasicParsing } finally { $ProgressPreference = $previous }
    }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedSha256) {
        Remove-Item -LiteralPath $target -Force
        throw "Checksum mismatch for $FileName (expected $ExpectedSha256, got $actual). The file was deleted; run again."
    }
    Write-Host "$FileName verified."
    return $target
}

function Find-InnoCompiler {
    if ($InnoCompiler) { return $InnoCompiler }
    foreach ($candidate in @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    return $null
}

try {
    $package = Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $version = $package.version
    $pgDriverVersion = $package.dependencies.pg
    if (-not $pgDriverVersion) { throw 'package.json has no "pg" dependency.' }
    Write-Step "Building A.Y Scan $version"

    Write-Step 'Building the web app and the server'
    Select-Pnpm
    Invoke-Pnpm @('install', '--frozen-lockfile')
    Invoke-Pnpm @('build')
    Invoke-Pnpm @('server:build')

    Write-Step 'Preparing the staging folder'
    if (Test-Path -LiteralPath $StageDir) { Remove-Item -LiteralPath $StageDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'dist') -Destination (Join-Path $StageDir 'dist') -Recurse
    Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'dist-server') -Destination (Join-Path $StageDir 'dist-server') -Recurse
    New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'db') | Out-Null
    Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'db\migrations') -Destination (Join-Path $StageDir 'db\migrations') -Recurse
    Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'db\seed') -Destination (Join-Path $StageDir 'db\seed') -Recurse
    New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'installer') | Out-Null
    foreach ($script in @('common.ps1', 'setup-database.ps1', 'start.ps1', 'stop.ps1', 'backup.ps1', 'restore.ps1', 'schedule-backup.ps1', 'start.cmd', 'stop.cmd', 'backup.cmd')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $StageDir "installer\$script")
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ay-scan.ico') -Destination (Join-Path $StageDir 'installer\ay-scan.ico')

    Write-Step 'Building the launcher (AYScan.exe)'
    $launcherBuild = Join-Path $ReleaseRoot 'launcher-build'
    New-Item -ItemType Directory -Force -Path $launcherBuild | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launcher\Launcher.cs') -Destination $launcherBuild -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ay-scan.ico') -Destination $launcherBuild -Force
    $csc = $null
    foreach ($frameworkDir in @('Framework64', 'Framework')) {
        $candidate = Join-Path $env:WINDIR "Microsoft.NET\$frameworkDir\v4.0.30319\csc.exe"
        if (Test-Path -LiteralPath $candidate) { $csc = $candidate; break }
    }
    if ($null -eq $csc) {
        Write-Warning 'csc.exe (.NET Framework 4) was not found; the installer will use PowerShell shortcuts instead of AYScan.exe.'
    } else {
        $launcherOutput = Join-Path $StageDir 'AYScan.exe'
        $compileLog = & $csc /nologo /target:winexe /optimize+ "/out:$launcherOutput" "/win32icon:$(Join-Path $launcherBuild 'ay-scan.ico')" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $launcherBuild 'Launcher.cs') 2>&1
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherOutput)) {
            Write-Warning "The launcher did not compile; the installer will use PowerShell shortcuts instead. Compiler output:`n$($compileLog | Out-String)"
        } else {
            Write-Host 'AYScan.exe built.'
        }
    }
    foreach ($document in @('README.md', 'LICENSE')) {
        $source = Join-Path $script:ProjectRoot $document
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $StageDir }
    }
    if (Test-Path -LiteralPath (Join-Path $script:ProjectRoot 'docs\devices')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'docs') | Out-Null
        Copy-Item -LiteralPath (Join-Path $script:ProjectRoot 'docs\devices') -Destination (Join-Path $StageDir 'docs\devices') -Recurse
    }

    Write-Step 'Installing production dependencies (pg only)'
    $runtimePackage = [ordered]@{ name = 'ayscan-runtime'; version = $version; private = $true; type = 'module'; dependencies = [ordered]@{ pg = $pgDriverVersion } }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $StageDir 'package.json'), ($runtimePackage | ConvertTo-Json -Depth 4), $utf8NoBom)
    Push-Location $StageDir
    try { Invoke-Checked (Get-NodeCommand | ForEach-Object { Join-Path (Split-Path $_ -Parent) 'npm.cmd' }) @('install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund') 'npm install failed.' } finally { Pop-Location }

    Write-Step 'Adding the bundled Node.js runtime'
    $nodeZip = Get-VerifiedDownload $NodeUrl $NodeZipName $NodeSha256
    $nodeTemp = Join-Path $CacheDir 'node-extract'
    if (Test-Path -LiteralPath $nodeTemp) { Remove-Item -LiteralPath $nodeTemp -Recurse -Force }
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeTemp -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'runtime\node') | Out-Null
    Copy-Item -LiteralPath (Join-Path $nodeTemp "node-v$NodeVersion-win-x64\node.exe") -Destination (Join-Path $StageDir 'runtime\node\node.exe')
    Copy-Item -LiteralPath (Join-Path $nodeTemp "node-v$NodeVersion-win-x64\LICENSE") -Destination (Join-Path $StageDir 'runtime\node\LICENSE') -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $nodeTemp -Recurse -Force

    Write-Step 'Adding the bundled PostgreSQL'
    $pgZip = Get-VerifiedDownload $PgUrl $PgZipName $PgSha256
    $pgTemp = Join-Path $CacheDir 'pg-extract'
    if (Test-Path -LiteralPath $pgTemp) { Remove-Item -LiteralPath $pgTemp -Recurse -Force }
    Expand-Archive -LiteralPath $pgZip -DestinationPath $pgTemp -Force
    $pgTarget = Join-Path $StageDir 'runtime\pgsql'
    New-Item -ItemType Directory -Force -Path $pgTarget | Out-Null
    # Only what the server needs: pgAdmin, StackBuilder, headers, docs and symbols are dropped (about 1 GB less).
    foreach ($part in @('bin', 'lib', 'share')) { Copy-Item -LiteralPath (Join-Path $pgTemp "pgsql\$part") -Destination (Join-Path $pgTarget $part) -Recurse }
    Remove-Item -LiteralPath $pgTemp -Recurse -Force
    foreach ($required in @('bin\pg_ctl.exe', 'bin\initdb.exe', 'bin\postgres.exe', 'bin\pg_dump.exe', 'bin\pg_restore.exe', 'share\extension\pg_trgm.control', 'share\extension\pgcrypto.control')) {
        if (-not (Test-Path -LiteralPath (Join-Path $pgTarget $required))) { throw "The PostgreSQL package is missing $required." }
    }

    $stageBytes = (Get-ChildItem -LiteralPath $StageDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    Write-Host ("Staged {0:N0} MB in {1}" -f ($stageBytes / 1MB), $StageDir)

    if ($SkipInstaller) {
        Write-Host 'Skipping the installer step (-SkipInstaller).'
    } else {
        Write-Step 'Compiling the installer with Inno Setup'
        $iscc = Find-InnoCompiler
        if (-not $iscc) { throw 'Inno Setup was not found. Install Inno Setup 6.5 or newer from https://jrsoftware.org/isdl.php, or pass -InnoCompiler "C:\path\ISCC.exe".' }
        Invoke-Checked $iscc @("/DAppVersion=$version", "/DStageDir=$StageDir", "/DOutputDir=$ReleaseRoot", (Join-Path $PSScriptRoot 'ayscan.iss')) 'Inno Setup failed.'
        $setup = Join-Path $ReleaseRoot "AYScan-Setup-$version.exe"
        if (-not (Test-Path -LiteralPath $setup)) { throw "Expected installer not found: $setup" }
        $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
        Set-Content -LiteralPath "$setup.sha256" -Value "$hash  AYScan-Setup-$version.exe" -Encoding ASCII
        if ($ReleaseRoot -ne $FinalOutputDir) {
            New-Item -ItemType Directory -Force -Path $FinalOutputDir | Out-Null
            Copy-Item -LiteralPath $setup -Destination $FinalOutputDir -Force
            Copy-Item -LiteralPath "$setup.sha256" -Destination $FinalOutputDir -Force
            $setup = Join-Path $FinalOutputDir "AYScan-Setup-$version.exe"
        }
        Write-Host ''
        Write-Host ("Installer ready: {0} ({1:N0} MB)" -f $setup, ((Get-Item -LiteralPath $setup).Length / 1MB)) -ForegroundColor Green
        Write-Host "SHA-256: $hash"
    }
} catch {
    Write-Host ''
    Write-Host "Build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
