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
#ifndef TrialSetup
  #define TrialSetup 0
#endif
#if TrialSetup
  #define AppName "A.Y Scan Trial"
  #define AppPort "8742"
#else
  #define AppName "A.Y Scan"
  #define AppPort "8741"
#endif
#define PowerShell "{sys}\WindowsPowerShell\v1.0\powershell.exe"
#define HasArabic FileExists(CompilerPath + "Languages\Arabic.isl")
#define HasLauncher FileExists(StageDir + "\AYScan.exe")

[Setup]
#if TrialSetup
AppId={{C27DAA91-711F-4EE9-8CB2-66B652A1C80D}
#else
; Never change AppId: it is how upgrades find the previous installation.
AppId={{8F3A6C52-1B47-4E9D-A0C5-3D2E7B914F60}
#endif
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=A.Y Scan
#if TrialSetup
DefaultDirName={autopf}\AYScan Trial
#else
DefaultDirName={autopf}\AYScan
#endif
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
OutputDir={#OutputDir}
#if TrialSetup
OutputBaseFilename=AYScan-Setup-{#AppVersion}-Trial
#else
OutputBaseFilename=AYScan-Setup-{#AppVersion}
#endif
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
#if TrialSetup
english.TrialDirectoryRequired=This folder contains an existing installation. Choose an empty folder, or the existing A.Y Scan Trial folder that contains trial-build.json.
#endif
english.DataKept=Patient data and backups were kept in:%n%1\data%n%1\backups%nThey are not deleted automatically. Delete these folders yourself only if you no longer need the data.
english.DbModeTitle=Database
english.DbModeSubtitle=Where should A.Y Scan keep its data?
english.DbModeBuiltin=Built-in database (recommended). Nothing else to install: the installer creates and prepares it for you.
english.DbModeExisting=Connect to a PostgreSQL server that is already installed (this computer or another one on the network)
english.DbFound=PostgreSQL was found on this computer (version %1). You can connect to it, or use the built-in database.
english.DbNotFound=PostgreSQL is not installed on this computer, so the installer will install the built-in database for you (recommended). Choose the second option only if your PostgreSQL runs on another computer.
english.DbDetailsTitle=PostgreSQL connection
english.DbDetailsSubtitle=The installer connects, creates the database if it does not exist, and creates all the tables.
english.DbHost=Server address (for example localhost):
english.DbPort=Port:
english.DbName=Database name (created if missing):
english.DbUser=User name:
english.DbPassword=Password:
english.DbBadHost=Enter the server address using English letters and digits.
english.DbBadPort=The port must be a number between 1 and 65535.
english.DbBadName=The database name must use English letters, digits or underscore only, and start with a letter.
english.DbBadUser=Enter the PostgreSQL user name.
english.DbPreparing=Preparing the database (the first time can take a minute)...
english.DbFailed=The database could not be prepared:%n%n%1%n%nChoose Retry to try again. Any other choice finishes the installation anyway (A.Y Scan will report the problem when it starts; the settings are in %2\.env).
#if HasArabic
arabic.GroupStartup=التشغيل:
arabic.GroupNetwork=الشبكة:
arabic.GroupBackup=النسخ الاحتياطي:
arabic.TaskAutostart=تشغيل A.Y Scan تلقائيًا عند بدء Windows
arabic.TaskLan=السماح لأجهزة أخرى في الشبكة بفتح A.Y Scan (يفتح المنفذ {#AppPort} في جدار حماية Windows)
arabic.TaskBackup=إنشاء نسخة احتياطية يومية لقاعدة البيانات الساعة 10 مساءً
arabic.StartNow=تشغيل A.Y Scan الآن
arabic.AsciiPathRequired=اختر مجلد تثبيت يحتوي مساره على أحرف إنجليزية وأرقام فقط (مثل C:\Program Files\AYScan)، لأن قاعدة البيانات لا تعمل بثبات مع المسارات التي بها حروف أخرى.
#if TrialSetup
arabic.TrialDirectoryRequired=يحتوي هذا المجلد على تثبيت موجود. اختر مجلدًا فارغًا أو مجلد A.Y Scan Trial الحالي الذي يحتوي على trial-build.json.
#endif
arabic.DataKept=تم الإبقاء على بيانات المرضى والنسخ الاحتياطية في:%n%1\data%n%1\backups%nلا تُحذف تلقائيًا. احذف هذين المجلدين بنفسك فقط إذا لم تعد تحتاج البيانات.
arabic.DbModeTitle=قاعدة البيانات
arabic.DbModeSubtitle=أين تريد أن يحفظ A.Y Scan بياناته؟
arabic.DbModeBuiltin=قاعدة بيانات مدمجة (موصى بها). لا حاجة لتثبيت أي شيء آخر: المثبّت ينشئها ويجهّزها لك.
arabic.DbModeExisting=الاتصال بخادم PostgreSQL مثبّت بالفعل (على هذا الجهاز أو جهاز آخر في الشبكة)
arabic.DbFound=تم العثور على PostgreSQL على هذا الجهاز (الإصدار %1). يمكنك الاتصال به أو استخدام القاعدة المدمجة.
arabic.DbNotFound=PostgreSQL غير مثبّت على هذا الجهاز، لذلك سيثبّت المثبّت القاعدة المدمجة لك (موصى به). اختر الخيار الثاني فقط إذا كان PostgreSQL يعمل على جهاز آخر.
arabic.DbDetailsTitle=الاتصال بـ PostgreSQL
arabic.DbDetailsSubtitle=سيتصل المثبّت بالخادم وينشئ قاعدة البيانات إن لم تكن موجودة، ثم ينشئ كل الجداول.
arabic.DbHost=عنوان الخادم (مثل localhost):
arabic.DbPort=المنفذ:
arabic.DbName=اسم قاعدة البيانات (تُنشأ إن لم تكن موجودة):
arabic.DbUser=اسم المستخدم:
arabic.DbPassword=كلمة المرور:
arabic.DbBadHost=اكتب عنوان الخادم بحروف وأرقام إنجليزية.
arabic.DbBadPort=المنفذ يجب أن يكون رقماً بين 1 و65535.
arabic.DbBadName=اسم القاعدة يجب أن يكون حروفاً إنجليزية وأرقاماً أو شرطة سفلية فقط، ويبدأ بحرف.
arabic.DbBadUser=اكتب اسم مستخدم PostgreSQL.
arabic.DbPreparing=جارٍ تجهيز قاعدة البيانات (قد تستغرق دقيقة في أول مرة)...
arabic.DbFailed=تعذر تجهيز قاعدة البيانات:%n%n%1%n%nاختر «إعادة المحاولة» للمحاولة مرة أخرى، وأي اختيار آخر يُنهي التثبيت على أي حال (سيعرض A.Y Scan المشكلة عند التشغيل، والإعدادات في %2\.env).
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
#if TrialSetup
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"" -TaskName ""A.Y Scan Trial daily backup"""; Flags: runhidden runasoriginaluser; Tasks: backup
#else
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"""; Flags: runhidden runasoriginaluser; Tasks: backup
#endif
#if HasLauncher
Filename: "{app}\AYScan.exe"; WorkingDir: "{app}"; Description: "{cm:StartNow}"; Flags: postinstall nowait skipifsilent runasoriginaluser
#else
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\start.ps1"""; WorkingDir: "{app}"; Description: "{cm:StartNow}"; Flags: postinstall nowait skipifsilent runasoriginaluser
#endif

[UninstallRun]
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\stop.ps1"""; Flags: runhidden; RunOnceId: "StopAYScan"
#if TrialSetup
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"" -Remove -TaskName ""A.Y Scan Trial daily backup"""; Flags: runhidden; RunOnceId: "RemoveBackupTask"
#else
Filename: "{#PowerShell}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\schedule-backup.ps1"" -Remove"; Flags: runhidden; RunOnceId: "RemoveBackupTask"
#endif
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#AppName}"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[Code]
var
  DbModePage: TInputOptionWizardPage;
  DbDetailsPage: TInputQueryWizardPage;

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

// Version of a PostgreSQL installed on this computer (EnterpriseDB installer), or '' when none is registered.
function FindInstalledPostgres: String;
var
  Names: TArrayOfString;
begin
  Result := '';
  if RegGetSubkeyNames(HKLM64, 'SOFTWARE\PostgreSQL\Installations', Names) and (GetArrayLength(Names) > 0) then
    Result := Names[GetArrayLength(Names) - 1]
  else if RegGetSubkeyNames(HKLM32, 'SOFTWARE\PostgreSQL\Installations', Names) and (GetArrayLength(Names) > 0) then
    Result := Names[GetArrayLength(Names) - 1];
end;

function IsFirstInstall: Boolean;
begin
  Result := not FileExists(WizardDirValue + '\.env');
end;

function UseExistingDatabase: Boolean;
begin
#if TrialSetup
  Result := False;
#else
  Result := DbModePage.Values[1];
#endif
end;

procedure InitializeWizard;
var
  Installed, Prompt: String;
begin
  Installed := FindInstalledPostgres;
  if Installed <> '' then
    Prompt := FmtMessage(CustomMessage('DbFound'), [Installed])
  else
    Prompt := CustomMessage('DbNotFound');
  DbModePage := CreateInputOptionPage(wpSelectTasks, CustomMessage('DbModeTitle'), CustomMessage('DbModeSubtitle'), Prompt, True, False);
  DbModePage.Add(CustomMessage('DbModeBuiltin'));
  DbModePage.Add(CustomMessage('DbModeExisting'));
  DbModePage.Values[0] := True;

  DbDetailsPage := CreateInputQueryPage(DbModePage.ID, CustomMessage('DbDetailsTitle'), CustomMessage('DbDetailsSubtitle'), '');
  DbDetailsPage.Add(CustomMessage('DbHost'), False);
  DbDetailsPage.Add(CustomMessage('DbPort'), False);
  DbDetailsPage.Add(CustomMessage('DbName'), False);
  DbDetailsPage.Add(CustomMessage('DbUser'), False);
  DbDetailsPage.Add(CustomMessage('DbPassword'), True);
  DbDetailsPage.Edits[0].Text := 'localhost';
  DbDetailsPage.Edits[1].Text := '5432';
  DbDetailsPage.Edits[2].Text := 'ayscan';
  DbDetailsPage.Edits[3].Text := 'postgres';
end;

// Upgrades keep the existing configuration, so the database pages only appear on a first install.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
#if TrialSetup
  Result := (PageID = DbModePage.ID) or (PageID = DbDetailsPage.ID);
#else
  Result := False;
  if PageID = DbModePage.ID then
    Result := not IsFirstInstall
  else if PageID = DbDetailsPage.ID then
    Result := (not IsFirstInstall) or (not UseExistingDatabase);
#endif
end;

function IsDatabaseName(const Value: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := (Length(Value) > 0) and (Length(Value) <= 63);
  if not Result then Exit;
  for I := 1 to Length(Value) do
  begin
    C := Value[I];
    if not (((C >= 'a') and (C <= 'z')) or ((C >= 'A') and (C <= 'Z')) or (C = '_') or ((I > 1) and (C >= '0') and (C <= '9'))) then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function PercentByte(Value: Integer): String;
begin
  Result := '%' + Copy('0123456789ABCDEF', (Value div 16) + 1, 1) + Copy('0123456789ABCDEF', (Value mod 16) + 1, 1);
end;

// Percent-encodes UTF-8 so user names and passwords with symbols or Arabic letters survive inside the connection URL.
function UrlEncode(const Value: String): String;
var
  I, Code: Integer;
  C: Char;
begin
  Result := '';
  for I := 1 to Length(Value) do
  begin
    C := Value[I];
    Code := Ord(C);
    if ((C >= 'a') and (C <= 'z')) or ((C >= 'A') and (C <= 'Z')) or ((C >= '0') and (C <= '9')) or (C = '-') or (C = '_') or (C = '.') or (C = '~') then
      Result := Result + C
    else if Code < 128 then
      Result := Result + PercentByte(Code)
    else if Code < 2048 then
      Result := Result + PercentByte(192 + (Code div 64)) + PercentByte(128 + (Code mod 64))
    else
      Result := Result + PercentByte(224 + (Code div 4096)) + PercentByte(128 + ((Code div 64) mod 64)) + PercentByte(128 + (Code mod 64));
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    if not IsAsciiOnly(WizardDirValue) then
    begin
      MsgBox(CustomMessage('AsciiPathRequired'), mbError, MB_OK);
      Result := False;
    end
#if TrialSetup
    else if FileExists(WizardDirValue + '\.env') and not FileExists(WizardDirValue + '\trial-build.json') then
    begin
      MsgBox(CustomMessage('TrialDirectoryRequired'), mbError, MB_OK);
      Result := False;
    end
#endif
    ;
  end
  else if CurPageID = DbDetailsPage.ID then
  begin
    Port := StrToIntDef(Trim(DbDetailsPage.Edits[1].Text), 0);
    if (Trim(DbDetailsPage.Edits[0].Text) = '') or not IsAsciiOnly(DbDetailsPage.Edits[0].Text) or (Pos(' ', Trim(DbDetailsPage.Edits[0].Text)) > 0) then
    begin
      MsgBox(CustomMessage('DbBadHost'), mbError, MB_OK);
      Result := False;
    end
    else if (Port < 1) or (Port > 65535) then
    begin
      MsgBox(CustomMessage('DbBadPort'), mbError, MB_OK);
      Result := False;
    end
    else if not IsDatabaseName(Trim(DbDetailsPage.Edits[2].Text)) then
    begin
      MsgBox(CustomMessage('DbBadName'), mbError, MB_OK);
      Result := False;
    end
    else if Trim(DbDetailsPage.Edits[3].Text) = '' then
    begin
      MsgBox(CustomMessage('DbBadUser'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// Runs installer\setup-database.ps1 as the signed-in Windows user (PostgreSQL refuses to run elevated) and keeps the window responsive.
procedure PrepareDatabase;
var
  ResultCode: Integer;
  Details: AnsiString;
  Answer: Integer;
  Done: Boolean;
begin
  WizardForm.StatusLabel.Caption := CustomMessage('DbPreparing');
  WizardForm.FilenameLabel.Caption := '';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  try
    Done := False;
    while not Done do
    begin
      ResultCode := -1;
      if ExecAsOriginalUser(ExpandConstant('{#PowerShell}'), '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\installer\setup-database.ps1') + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then
        Done := True
      else
      begin
        Details := '';
        if not LoadStringFromFile(ExpandConstant('{app}\logs\setup-database-error.log'), Details) then
          Details := SysErrorMessage(ResultCode);
        Answer := SuppressibleMsgBox(FmtMessage(CustomMessage('DbFailed'), [Trim(String(Details)), ExpandConstant('{app}')]), mbError, MB_ABORTRETRYIGNORE, IDIGNORE);
        if Answer <> IDRETRY then
          Done := True;
      end;
    end;
  finally
    WizardForm.ProgressGauge.Style := npbstNormal;
  end;
end;

// First install only: write .env (ASCII, relative paths) and prepare the database. An existing .env is a customer's configuration and is kept.
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
      Lines[9] := 'WEB_ROOT=dist';
      if UseExistingDatabase then
      begin
        Lines[5] := 'EMBEDDED_PG=false';
        Lines[6] := 'USE_DOCKER_DATABASE=false';
        Lines[7] := 'DATABASE_URL=postgresql://' + UrlEncode(Trim(DbDetailsPage.Edits[3].Text)) + ':' + UrlEncode(DbDetailsPage.Edits[4].Text) + '@' + Trim(DbDetailsPage.Edits[0].Text) + ':' + IntToStr(StrToIntDef(Trim(DbDetailsPage.Edits[1].Text), 5432)) + '/' + Trim(DbDetailsPage.Edits[2].Text);
        Lines[8] := 'PG_PORT=55432';
      end
      else
      begin
        Lines[5] := 'EMBEDDED_PG=true';
        Lines[6] := 'PG_BIN_DIR=runtime/pgsql/bin';
        Lines[7] := 'PG_DATA_DIR=data/pgdata';
        Lines[8] := 'PG_PORT=55432';
      end;
      SaveStringsToFile(EnvPath, Lines, False);
      PrepareDatabase;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usDone) and DirExists(ExpandConstant('{app}\data')) then
    MsgBox(FmtMessage(CustomMessage('DataKept'), [ExpandConstant('{app}')]), mbInformation, MB_OK);
end;
