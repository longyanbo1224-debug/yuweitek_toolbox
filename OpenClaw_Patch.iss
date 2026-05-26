; OpenClaw AI 组件补丁包
#define MyAppName "OpenClaw AI 组件"
#define MyAppVersion "1.0.0"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=龙彦博
; 从注册表读取主程序安装路径，若读取失败则默认到 Program Files
DefaultDirName={reg:HKLM\SOFTWARE\YUWEITEK工具箱,InstallPath|{autopf}\YUWEITEK工具箱}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\openclaw\portable\app\core\node_modules\openclaw\assets\logo.ico
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename=OpenClaw_Patch_v{#MyAppVersion}
SetupIconFile=openclaw_icon.ico
; 请求管理员权限（因为主程序通常在 Program Files）
PrivilegesRequired=admin

[Files]
; 复制整个 openclaw 文件夹到主程序目录（{app} 即上一步确定的路径）
Source: "openclaw\*"; DestDir: "{app}\openclaw"; Flags: recursesubdirs ignoreversion

[Icons]
; Name: "{group}\卸载 OpenClaw 组件"; Filename: "{uninstallexe}"

[Run]
; 安装完成后可提示用户重新启动工具箱（可选）
Filename: "{app}\YUWEITEK工具箱.exe"; Description: "立即启动 YUWEITEK工具箱"; Flags: postinstall nowait skipifsilent