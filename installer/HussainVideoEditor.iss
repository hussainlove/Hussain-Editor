; ============================================================================
; Hussain Video Editor - Production Windows 10/11 64-bit Installer Script
; Compiler: Inno Setup 6+
; ============================================================================

#define MyAppName "Hussain Video Editor"
#define MyAppShortName "HussainVideoEditor"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Hussain Multimedia Systems"
#define MyAppExeName "HussainVideoEditor.exe"
#define MyAppAssocName "Hussain Video Editor Project"
#define MyAppAssocExt ".hveproject"
#define MyAppAssocKey StringChange(MyAppAssocName, " ", "") + MyAppAssocExt

[Setup]
AppId={{899C9DEF-CFE7-48CF-9B32-73FEAC0EA157}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=dist_installer
OutputBaseFilename=HussainVideoEditor-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesAssociations=yes
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
Name: "{userappdata}\{#MyAppName}\projects"
Name: "{userappdata}\{#MyAppName}\projects\autosave"
Name: "{userappdata}\{#MyAppName}\cache\thumbnails"
Name: "{userappdata}\{#MyAppName}\cache\waveforms"
Name: "{userappdata}\{#MyAppName}\cache\proxies"
Name: "{userappdata}\{#MyAppName}\cache\exports"
Name: "{userappdata}\{#MyAppName}\logs"
Name: "{app}\auto_import"
Name: "{app}\auto_import\imported"

[Files]
Source: "..\dist\HussainVideoEditor\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\auto_import.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\server.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\vite.config.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\tsconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\ffmpeg\bin\ffmpeg.exe"; DestDir: "{app}\ffmpeg\bin"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\ffmpeg\bin\ffprobe.exe"; DestDir: "{app}\ffmpeg\bin"; Flags: ignoreversion skipifsourcedoesntexist

[Registry]
Root: HKA; Subkey: "Software\Classes\{#MyAppAssocExt}\OpenWithProgids"; ValueType: string; ValueName: "{#MyAppAssocKey}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\{#MyAppAssocKey}"; ValueType: string; ValueName: ""; ValueData: "{#MyAppAssocName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\{#MyAppAssocKey}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"
Root: HKA; Subkey: "Software\Classes\{#MyAppAssocKey}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".hveproject"; ValueData: ""

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{autodesktop}\{#MyAppName} - Auto Import (.BAT)"; Filename: "{app}\auto_import.bat"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
