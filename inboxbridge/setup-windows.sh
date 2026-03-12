#!/bin/bash
#
# InboxBridge Windows Setup Script (Part 1: WSL)
#
# This script:
# 1. Installs Windows build tools
# 2. Builds InboxBridge for Windows
# 3. Creates Windows manifest
# 4. Copies everything to Windows filesystem
#
# Run this in WSL, then run the PowerShell script in Windows.
#

set -e  # Exit on error

echo "========================================="
echo "InboxBridge Windows Setup (WSL Part)"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Step 1: Installing Windows build tools...${NC}"
if ! rustup target list --installed | grep -q "x86_64-pc-windows-gnu"; then
    echo "Installing Rust Windows target..."
    rustup target add x86_64-pc-windows-gnu
else
    echo "✓ Windows target already installed"
fi

if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo "Installing mingw-w64 cross-compiler..."
    sudo apt-get update
    sudo apt-get install -y mingw-w64
else
    echo "✓ mingw-w64 already installed"
fi

echo ""
echo -e "${YELLOW}Step 2: Building InboxBridge for Windows...${NC}"
cargo build --release --target x86_64-pc-windows-gnu

# Check if build succeeded
if [ ! -f "target/x86_64-pc-windows-gnu/release/inboxbridge.exe" ]; then
    echo -e "${RED}✗ Build failed! Binary not found.${NC}"
    exit 1
fi

BINARY_SIZE=$(ls -lh target/x86_64-pc-windows-gnu/release/inboxbridge.exe | awk '{print $5}')
echo -e "${GREEN}✓ Build successful! Binary size: $BINARY_SIZE${NC}"

echo ""
echo -e "${YELLOW}Step 3: Creating Windows manifest...${NC}"

# Detect Windows username (usually same as WSL username)
WIN_USER="${USER}"
if [ -d "/mnt/c/Users/${WIN_USER}" ]; then
    echo "✓ Detected Windows user: $WIN_USER"
else
    echo -e "${YELLOW}Warning: Could not auto-detect Windows username.${NC}"
    echo -n "Enter your Windows username: "
    read WIN_USER
fi

# Create manifest with correct extension ID
cat > com.inboxkey.bridge.json <<'EOF'
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge Native Messaging Host for IMAP Support",
  "path": "C:\\Program Files\\InboxBridge\\inboxbridge.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://mioicbneapdjamkppcidooggnmegpocn/"
  ]
}
EOF

echo -e "${GREEN}✓ Manifest created${NC}"

echo ""
echo -e "${YELLOW}Step 4: Copying files to Windows...${NC}"

# Create Windows directory
WIN_INSTALL_DIR="/mnt/c/Program Files/InboxBridge"
mkdir -p "$WIN_INSTALL_DIR"

# Copy binary
echo "Copying inboxbridge.exe..."
cp target/x86_64-pc-windows-gnu/release/inboxbridge.exe "$WIN_INSTALL_DIR/"

# Copy manifest
echo "Copying manifest..."
cp com.inboxkey.bridge.json "$WIN_INSTALL_DIR/"

# Make binary executable (in case permissions matter)
chmod +x "$WIN_INSTALL_DIR/inboxbridge.exe"

echo -e "${GREEN}✓ Files copied to: C:\\Program Files\\InboxBridge\\${NC}"

echo ""
echo -e "${YELLOW}Step 5: Creating PowerShell install script...${NC}"

# Create PowerShell script for Windows
cat > /mnt/c/Users/${WIN_USER}/Desktop/install-inboxbridge.ps1 <<'PSEOF'
# InboxBridge Windows Setup Script (Part 2: Windows)
#
# This script:
# 1. Installs Native Messaging manifest in Windows Registry
# 2. Verifies installation
# 3. Tests binary execution
#
# Run this in PowerShell as Administrator!
#

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "InboxBridge Windows Setup (Windows Part)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Step 1: Verifying files exist..." -ForegroundColor Yellow
$binaryPath = "C:\Program Files\InboxBridge\inboxbridge.exe"
$manifestPath = "C:\Program Files\InboxBridge\com.inboxkey.bridge.json"

if (-not (Test-Path $binaryPath)) {
    Write-Host "ERROR: Binary not found at $binaryPath" -ForegroundColor Red
    Write-Host "Did you run the WSL script first?" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $manifestPath)) {
    Write-Host "ERROR: Manifest not found at $manifestPath" -ForegroundColor Red
    Write-Host "Did you run the WSL script first?" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Binary found: $binaryPath" -ForegroundColor Green
Write-Host "✓ Manifest found: $manifestPath" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Installing Native Messaging manifest in registry..." -ForegroundColor Yellow

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge"

# Create registry key
try {
    New-Item -Path $regPath -Force | Out-Null
    Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath
    Write-Host "✓ Registry key created: $regPath" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to create registry key" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Step 3: Verifying installation..." -ForegroundColor Yellow

# Check registry
$regValue = (Get-ItemProperty -Path $regPath)."(Default)"
if ($regValue -eq $manifestPath) {
    Write-Host "✓ Registry value correct: $regValue" -ForegroundColor Green
} else {
    Write-Host "WARNING: Registry value mismatch!" -ForegroundColor Yellow
    Write-Host "  Expected: $manifestPath" -ForegroundColor Yellow
    Write-Host "  Got: $regValue" -ForegroundColor Yellow
}

# Check manifest content
$manifestContent = Get-Content $manifestPath -Raw | ConvertFrom-Json
Write-Host "✓ Manifest loaded successfully" -ForegroundColor Green
Write-Host "  Extension ID: $($manifestContent.allowed_origins[0])" -ForegroundColor Cyan

Write-Host ""
Write-Host "Step 4: Testing binary execution..." -ForegroundColor Yellow

# Create test input (bridge.ping)
$request = '{"v":1,"id":"test-1","method":"bridge.ping","params":{}}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($request)
$length = [BitConverter]::GetBytes([uint32]$bytes.Length)
$input = $length + $bytes

# Write to temp file
$tempInput = "$env:TEMP\inboxbridge-test-input.bin"
$tempOutput = "$env:TEMP\inboxbridge-test-output.bin"
[System.IO.File]::WriteAllBytes($tempInput, $input)

# Run binary
try {
    $process = Start-Process -FilePath $binaryPath -RedirectStandardInput $tempInput -RedirectStandardOutput $tempOutput -NoNewWindow -Wait -PassThru

    if ($process.ExitCode -eq 0) {
        # Read output
        $outputBytes = [System.IO.File]::ReadAllBytes($tempOutput)
        if ($outputBytes.Length -ge 4) {
            $responseLength = [BitConverter]::ToUInt32($outputBytes, 0)
            $responseJson = [System.Text.Encoding]::UTF8.GetString($outputBytes, 4, [Math]::Min($responseLength, $outputBytes.Length - 4))
            $response = $responseJson | ConvertFrom-Json

            if ($response.result.ok -eq $true) {
                Write-Host "✓ Binary test PASSED!" -ForegroundColor Green
                Write-Host "  Version: $($response.result.version)" -ForegroundColor Cyan
                Write-Host "  Protocol: v$($response.result.protocolVersion)" -ForegroundColor Cyan
            } else {
                Write-Host "WARNING: Binary responded but result not OK" -ForegroundColor Yellow
                Write-Host "  Response: $responseJson" -ForegroundColor Yellow
            }
        } else {
            Write-Host "WARNING: Binary output too short" -ForegroundColor Yellow
        }
    } else {
        Write-Host "WARNING: Binary exited with code $($process.ExitCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Could not test binary execution" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

# Cleanup
if (Test-Path $tempInput) { Remove-Item $tempInput }
if (Test-Path $tempOutput) { Remove-Item $tempOutput }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Close ALL Chrome windows (important!)" -ForegroundColor Yellow
Write-Host "2. Restart Chrome" -ForegroundColor Yellow
Write-Host "3. Load the InboxKey extension from:" -ForegroundColor Yellow
Write-Host "   \\wsl$\Ubuntu\home\dev\work\inboxkey\extension\build\chrome-mv3-prod" -ForegroundColor Cyan
Write-Host "4. Click the extension icon -> Accounts -> Add IMAP" -ForegroundColor Yellow
Write-Host "5. Test connection!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "- If 'InboxBridge not installed': Check chrome://extensions for correct extension ID" -ForegroundColor Gray
Write-Host "- If 'Authentication failed': SUCCESS! (means connection works, just wrong credentials)" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
PSEOF

echo -e "${GREEN}✓ PowerShell script created: C:\\Users\\${WIN_USER}\\Desktop\\install-inboxbridge.ps1${NC}"

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}WSL Part Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Open PowerShell as Administrator (Win+X -> PowerShell (Admin))"
echo "2. Run the script on your Desktop:"
echo -e "   ${YELLOW}cd ~\\Desktop${NC}"
echo -e "   ${YELLOW}.\\install-inboxbridge.ps1${NC}"
echo ""
echo "3. Follow the instructions in the PowerShell script"
echo ""
echo -e "${GREEN}Files installed to:${NC}"
echo "  - Binary: C:\\Program Files\\InboxBridge\\inboxbridge.exe"
echo "  - Manifest: C:\\Program Files\\InboxBridge\\com.inboxkey.bridge.json"
echo "  - Install script: C:\\Users\\${WIN_USER}\\Desktop\\install-inboxbridge.ps1"
echo ""
