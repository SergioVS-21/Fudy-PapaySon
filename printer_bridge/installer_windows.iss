[Setup]
AppName=PrinterBridge
AppVersion=0.1.0
DefaultDirName={autopf}\PrinterBridge
DefaultGroupName=PrinterBridge
OutputDir=dist-installer
OutputBaseFilename=PrinterBridge-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\PrinterBridge\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "FIRESTORE_SETUP.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "service-account.template.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\PrinterBridge"; Filename: "{app}\PrinterBridge.exe"
Name: "{autodesktop}\PrinterBridge"; Filename: "{app}\PrinterBridge.exe"
Name: "{group}\Guia Firestore"; Filename: "{app}\FIRESTORE_SETUP.md"

[Run]
Filename: "{app}\PrinterBridge.exe"; Description: "Abrir PrinterBridge"; Flags: nowait postinstall skipifsilent