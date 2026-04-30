# InboxBridge Portable Installer for Windows
# Run: Right-click > Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== InboxBridge Installer ===" -ForegroundColor Cyan
Write-Host ""

# Paths (per-user, no elevation needed)
$InstallDir = "$env:LOCALAPPDATA\InboxBridge"
$BinaryName = "inboxbridge.exe"
$ManifestName = "com.inboxkey.bridge.json"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceBinary = Join-Path $ScriptDir $BinaryName
$ExtensionId = "mioicbneapdjamkppcidooggnmegpocn"

# Check binary exists
if (-not (Test-Path $SourceBinary)) {
    Write-Host "ERROR: $BinaryName not found in the same folder as this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Create install directory
Write-Host "Installing to $InstallDir ..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Copy binary
Copy-Item $SourceBinary "$InstallDir\$BinaryName" -Force
Write-Host "  Binary copied." -ForegroundColor Green

# Generate manifest
$ManifestPath = "$InstallDir\$ManifestName"
$BinaryPath = "$InstallDir\$BinaryName" -replace '\\', '\\'
@"
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge Native Messaging Host for IMAP Support",
  "path": "$BinaryPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@ | Set-Content -Path $ManifestPath -Encoding UTF8
Write-Host "  Manifest created." -ForegroundColor Green

# Registry key
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath
Write-Host "  Registry key set." -ForegroundColor Green

Write-Host ""
Write-Host "Done! Close ALL Chrome windows and reopen Chrome." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
