#define MyAppVersion "1.4.1"
#define MyAppName "YUWEITEK工具箱 Agent"
#define MyAppPublisher "龙彦博"
#define MyAppExeName "YUWEITEK工具箱 Agent.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename={#MyAppName}_{#MyAppVersion}_Setup
SetupIconFile=app.ico
PrivilegesRequired=admin

; 外观设置
WizardStyle=modern
WizardSizePercent=120
WizardImageAlphaFormat=defined
; 向导左侧大图（24位位图 164x314）
WizardImageFile=WizImage.bmp
; 向导右上角小图（24位位图 55x55）
WizardSmallImageFile=WizSmallImage.bmp

; 窗口配色
SetupLogging=yes
DisableWelcomePage=no
DisableProgramGroupPage=yes
DisableReadyPage=no
CloseApplications=yes
RestartApplications=no
AppMutex=Global\YUWEITEK_TOOLBOX_MUTEX

; 版本信息（写入exe属性）
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} 安装程序
VersionInfoCopyright=Copyright (C) 2024 {#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

; 安装完成后不自动删除临时文件（加快修复安装）
; CreateUninstallRegKey=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "D:\Program Files (x86)\Inno Setup 6\Languages\ChineseSimplified.isl"

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式(&D)"; GroupDescription: "附加图标："; Flags: unchecked

[Registry]
Root: HKLM; Subkey: "SOFTWARE\YUWEITEK工具箱"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}(&R)"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\*.log"

[Code]
// 安装前强制杀掉旧版本进程，防止托盘程序无法被默认 CloseApplications 关闭
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  ExeName: String;
begin
  ExeName := '{#MyAppExeName}';
  // 先尝试 taskkill（带 /f 强制终止，/im 按进程名匹配）
  Exec('taskkill.exe', '/f /im "' + ExeName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // taskkill 返回 0=成功杀掉, 128=进程不存在（也算成功）
  // 等待一小段时间确保进程完全退出
  Sleep(1000);
  // 如果 taskkill 失败（进程仍存在），尝试再次杀
  Exec('taskkill.exe', '/f /im "' + ExeName + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(500);
  // 返回空字符串表示成功，非空表示失败（会阻断安装）
  Result := '';
end;
