; InboxBridge Installer for Windows
; Consumed by: iscc inboxbridge.iss /dBinaryDir=..\..\target\release /dAppVersion=1.0.0
; Output: InboxBridge-{AppVersion}-windows-x64.exe

#define AppName "InboxBridge"
; AppVersion is passed via /dAppVersion=x.y.z from CI
#define AppPublisher "InboxKey Contributors"
#define AppURL "https://github.com/slmnsrf/inboxkey"
#define ExtensionId "mioicbneapdjamkppcidooggnmegpocn"

[Setup]
AppId={{B7E4F2A1-9C3D-4F8E-A6B5-1D2E3F4A5B6C}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={localappdata}\InboxBridge
DisableProgramGroupPage=yes
OutputBaseFilename=InboxBridge-{#AppVersion}-windows-x64
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\inboxbridge.exe

[Files]
Source: "{#BinaryDir}\inboxbridge.exe"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge"; \
  ValueType: string; ValueData: "{app}\com.inboxkey.bridge.json"; Flags: uninsdeletekey

[UninstallRun]
Filename: "{app}\inboxbridge.exe"; Parameters: "--cleanup"; \
  Flags: runhidden nowait skipifdoesntexist

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ManifestPath: String;
  BinaryPath: String;
  ManifestContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    ManifestPath := ExpandConstant('{app}\com.inboxkey.bridge.json');
    BinaryPath := ExpandConstant('{app}\inboxbridge.exe');
    StringChangeEx(BinaryPath, '\', '\\', True);
    ManifestContent :=
      '{' + #13#10 +
      '  "name": "com.inboxkey.bridge",' + #13#10 +
      '  "description": "InboxBridge Native Messaging Host for IMAP Support",' + #13#10 +
      '  "path": "' + BinaryPath + '",' + #13#10 +
      '  "type": "stdio",' + #13#10 +
      '  "allowed_origins": [' + #13#10 +
      '    "chrome-extension://{#ExtensionId}/"' + #13#10 +
      '  ]' + #13#10 +
      '}';
    SaveStringToFile(ManifestPath, ManifestContent, False);
  end;
end;
