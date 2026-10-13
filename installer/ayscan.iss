; A.Y Scan Windows installer (Inno Setup 6.5 or newer).
; Do not compile by hand: run installer\build-release.ps1, which stages the files and passes the defines below.
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef StageDir
  #define StageDir "..\release\stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\release"
#endif
#define AppName "A.Y Scan"
#define AppPort "3001"
#define PowerShell "{sys}\WindowsPowerShell\v1.0\powershell.exe"
#define HasArabic FileExists(CompilerPath + "Languages\Arabic.isl")
#define HasLauncher FileExists(StageDir + "\AYScan.exe")

[Setup]
; Never change AppId: it is how upgrades find the previous installation.
AppId={{8F3A6C52-1B47-4E9D-A0C5-3D2E7B914F60}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=A.Y Scan
DefaultDirName={autopf}\AYScan
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
OutputDir={#OutputDir}
OutputBaseFilename=AYScan-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=ay-scan.ico
#if HasLauncher
UninstallDisplayIcon={app}\AYScan.exe
#else
UninstallDisplayIcon={app}\installer\ay-scan.ico
#endif
UninstallDisplayName={#AppName}
CloseApplications=no
RestartApplications=no

[Languages]
#if HasArabic
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
#endif
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.GroupStartup=Startup:
english.GroupNetwork=Network:
english.GroupBackup=Backups:
english.TaskAutostart=Start A.Y Scan automatically when Windows starts
english.TaskLan=Allow other computers on this network to open A.Y Scan (opens port {#AppPort} in Windows Firewall)
english.TaskBackup=Create a daily database backup at 10:00 PM
english.StartNow=Start A.Y Scan now
english.AsciiPathRequired=Choose an installation folder whose path uses English letters and digits only (for example C:\Program Files\AYScan). The database does not run reliably from paths with other characters.
english.DataKept=Patient data and backups were kept in:%n%1\data%n%1\backups%nThey are not deleted automatically. Delete these folders yourself only if you no longer need the data.
#if HasArabic
arabic.GroupStartup=التشغيل:
arabic.GroupNetwork=الشبكة:
arabic.GroupBackup=النسخ الاحتياطي:
arabic.TaskAutostart=تشغيل A.Y Scan تلقائيًا عند بدء Windows
arabic.TaskLan=السماح لأجهزة أخرى في الشبكة بفتح A.Y Scan (يفتح المنفذ {#AppPort} في جدار حماية Windows)
arabic.TaskBackup=إنشاء نسخة احتياطية يومية لقاعدة البيانات الساعة 10 مساءً
arabic.StartNow=تشغيل A.Y Scan الآن
arabic.AsciiPathRequired=اختر مجلد تثبيت يحتوي مساره على أحرف إنجليزية وأرقام فقط (مثل C:\Program Files\AYScan)، لأن قاعدة البيانات لا تعمل بثبات مع المسارات التي بها حروف أخرى.
arabic.DataKept=تم الإبقاء على بيانات المرضى والنسخ الاحتياطية في:%n%1\data%n%1\backups%nلا تُحذف تلقائيًا. احذف هذين المجلدين بنفسك فقط إذا لم تعد تحتاج البيانات.
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "{cm:TaskAutostart}"; GroupDescription: "{cm:GroupStartup}"
Name: "lan"; Description: "{cm:TaskLan}"; GroupDescription: "{cm:GroupNetwork}"; Flags: unchecked
Name: "backup"; Description: "{cm:TaskBackup}"; GroupDescription: "{cm:GroupBackup}"

[Files]
; .env and the data folders are created at install time and are never overwritten or removed by upgrades.
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env,data\*,logs\*,run\*,backups\*"

[Dirs]
; The app runs as the signed-in Windows user, so only these folders are writable by it (not the program files).
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify
Name: "{app}\run"; Permissions: users-modify
Name: "{app}\backups"; Permissions: users-modify

[Icons]
#if HasLauncher
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\AYScan.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\{#AppName} - Stop"; Filename: "{app}\AYScan.exe"; Parameters: "--stop"; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autoprograms}\{#AppName} - Backup now"; Filename: "{app}\AYScan.exe"; Parameters: "--backup"; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autoprograms}\{#AppName} - Backups folder"; Filename: "{app}\backups"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\AYScan.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commonstartup}\{#AppName}"; Filename: "{app}\AYScan.exe"; Parameters: "--no-browser"; WorkingDir: "{app}"; Tasks: autostart
#else
Name: "{autoprograms}\{#AppName}"; Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\start.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autoprograms}\{#AppName} - Stop"; Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\stop.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autoprograms}\{#AppName} - Backup now"; Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\backup.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autoprograms}\{#AppName} - Backups folder"; Filename: "{app}\backups"; IconFilename: "{app}\installer\ay-scan.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\start.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"; Tasks: desktopicon
Name: "{commonstartup}\{#AppName}"; Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\start.ps1"" -NoBrowser"; WorkingDir: "{app}"; IconFilename: "{app}\installer\ay-scan.ico"; Tasks: autostart
#endif

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#AppName}"" dir=in action=allow protocol=TCP localport={#AppPort} profile=private,domain"; Flags: runhidden; Tasks: lan
; runasoriginaluser: the backup task must belong to the Windows user who uses the app, not to the elevated installer account.
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"""; Flags: runhidden runasoriginaluser; Tasks: backup
#if HasLauncher
Filename: "{app}\AYScan.exe"; WorkingDir: "{app}"; Description: "{cm:StartNow}"; Flags: postinstall nowait skipifsilent runasoriginaluser
#else
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\start.ps1"""; WorkingDir: "{app}"; Description: "{cm:StartNow}"; Flags: postinstall nowait skipifsilent runasoriginaluser
#endif

[UninstallRun]
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\stop.ps1"""; Flags: runhidden; RunOnceId: "StopAYScan"
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"" -Remove"; Flags: runhidden; RunOnceId: "RemoveBackupTask"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#AppName}"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[Code]
function IsAsciiOnly(const Value: String): Boolean;
var
  I: Integer;
begin
  Result := True;
  for I := 1 to Length(Value) do
    if Ord(Value[I]) > 127 then
    begin
      Result := False;
      Exit;
    end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
    if not IsAsciiOnly(WizardDirValue) then
    begin
      MsgBox(CustomMessage('AsciiPathRequired'), mbError, MB_OK);
      Result := False;
    end;
end;

// First install only: write .env (ASCII, relative paths). An existing .env is a customer's configuration and is kept.
procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath, HostValue: String;
  Lines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    EnvPath := ExpandConstant('{app}\.env');
    if not FileExists(EnvPath) then
    begin
      if WizardIsTaskSelected('lan') then
        HostValue := '0.0.0.0'
      else
        HostValue := '127.0.0.1';
      SetArrayLength(Lines, 10);
      Lines[0] := 'PORT={#AppPort}';
      Lines[1] := 'HOST=' + HostValue;
      Lines[2] := 'NODE_ENV=production';
      Lines[3] := 'APP_TIMEZONE=Africa/Cairo';
      Lines[4] := 'MIGRATE_ON_START=true';
      Lines[5] := 'EMBEDDED_PG=true';
      Lines[6] := 'PG_BIN_DIR=runtime/pgsql/bin';
      Lines[7] := 'PG_DATA_DIR=data/pgdata';
      Lines[8] := 'PG_PORT=55432';
      Lines[9] := 'WEB_ROOT=dist';
      SaveStringsToFile(EnvPath, Lines, False);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usDone) and DirExists(ExpandConstant('{app}\data')) then
    MsgBox(FmtMessage(CustomMessage('DataKept'), [ExpandConstant('{app}')]), mbInformation, MB_OK);
end;
