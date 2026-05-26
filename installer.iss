#define MyAppVersion "1.3.0"
#define MyAppName "YUWEITEK工具箱 Agent"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=龙彦博
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppName}.exe
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename={#MyAppName}_{#MyAppVersion}_Setup
SetupIconFile=app.ico

; 请求管理员权限
PrivilegesRequired=admin

; 向导右上角小图像（请将图像文件 WizSmallImage.bmp 放在脚本同目录）
WizardSmallImageFile=WizSmallImage.bmp

[Files]
Source: "dist\{#MyAppName}.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppName}.exe"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppName}.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加图标："

[Registry]
Root: HKLM; Subkey: "SOFTWARE\YUWEITEK工具箱"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#MyAppName}.exe"; Description: "立即运行 {#MyAppName}"; Flags: postinstall nowait skipifsilent

; 卸载时执行清理程序（已注释，无需启用）
; [UninstallRun]
; Filename: "{app}\cleanup.exe"; Parameters: ""; Flags: runhidden; Check: FileExists('{app}\cleanup.exe')
