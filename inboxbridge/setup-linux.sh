#!/bin/bash
#
# InboxBridge Linux Setup Script
#
# This script:
# 1. Checks for required dependencies
# 2. Builds InboxBridge for Linux
# 3. Installs binary to user directory
# 4. Creates Native Messaging manifest for Chrome/Chromium
# 5. Tests the installation
#
# Supports: Chrome, Chromium, Brave, Edge
#

set -e  # Exit on error

echo "========================================="
echo "InboxBridge Linux Setup"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
    DISTRO_NAME=$NAME
else
    DISTRO="unknown"
    DISTRO_NAME="Unknown Linux"
fi

echo -e "${CYAN}Detected: $DISTRO_NAME${NC}"
echo ""

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}ERROR: Rust is not installed!${NC}"
    echo ""
    echo "Install Rust from: https://rustup.rs"
    echo "Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo ""
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking dependencies...${NC}"

# Check for Secret Service (required for keyring storage)
SECRET_SERVICE_OK=false
if command -v gnome-keyring-daemon &> /dev/null || command -v seahorse &> /dev/null; then
    SECRET_SERVICE_OK=true
    echo "✓ GNOME Keyring found"
elif systemctl --user is-active --quiet gnome-keyring-daemon.service 2>/dev/null; then
    SECRET_SERVICE_OK=true
    echo "✓ GNOME Keyring service running"
elif command -v kwallet-query &> /dev/null; then
    SECRET_SERVICE_OK=true
    echo "✓ KWallet found"
else
    echo -e "${YELLOW}⚠ Secret Service not detected${NC}"
    echo ""
    echo "InboxBridge requires a Secret Service provider for secure password storage."
    echo ""
    echo "Install one of:"
    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        echo "  • GNOME Keyring: sudo apt install gnome-keyring libsecret-1-0"
        echo "  • KWallet (KDE): sudo apt install kwalletmanager"
    elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
        echo "  • GNOME Keyring: sudo dnf install gnome-keyring libsecret"
        echo "  • KWallet (KDE): sudo dnf install kwalletmanager"
    elif [ "$DISTRO" = "arch" ] || [ "$DISTRO" = "manjaro" ]; then
        echo "  • GNOME Keyring: sudo pacman -S gnome-keyring libsecret"
        echo "  • KWallet (KDE): sudo pacman -S kwallet"
    else
        echo "  • GNOME Keyring or KWallet via your package manager"
    fi
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for pkg-config and libssl (build dependencies)
MISSING_DEPS=()
if ! command -v pkg-config &> /dev/null; then
    MISSING_DEPS+=("pkg-config")
fi

if ! pkg-config --exists openssl 2>/dev/null && ! pkg-config --exists libssl 2>/dev/null; then
    MISSING_DEPS+=("libssl-dev or openssl-devel")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Missing build dependencies: ${MISSING_DEPS[*]}${NC}"
    echo ""
    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        echo "Install with: sudo apt install pkg-config libssl-dev"
    elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
        echo "Install with: sudo dnf install pkg-config openssl-devel"
    elif [ "$DISTRO" = "arch" ] || [ "$DISTRO" = "manjaro" ]; then
        echo "Install with: sudo pacman -S pkg-config openssl"
    else
        echo "Install pkg-config and openssl development headers via your package manager"
    fi
    echo ""
    exit 1
else
    echo "✓ Build dependencies satisfied"
fi

echo ""
echo -e "${YELLOW}Step 2: Building InboxBridge for Linux...${NC}"

# Use native target (automatically detected)
cargo build --release

# Check if build succeeded
BINARY_PATH="target/release/inboxbridge"
if [ ! -f "$BINARY_PATH" ]; then
    echo -e "${RED}✗ Build failed! Binary not found at: $BINARY_PATH${NC}"
    exit 1
fi

BINARY_SIZE=$(ls -lh "$BINARY_PATH" | awk '{print $5}')
echo -e "${GREEN}✓ Build successful! Binary size: $BINARY_SIZE${NC}"

echo ""
echo -e "${YELLOW}Step 3: Installing binary...${NC}"

# Install to user's local bin directory
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

cp "$BINARY_PATH" "$INSTALL_DIR/inboxbridge"
chmod +x "$INSTALL_DIR/inboxbridge"

echo -e "${GREEN}✓ Binary installed to: $INSTALL_DIR/inboxbridge${NC}"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo -e "${YELLOW}⚠ Warning: $HOME/.local/bin is not in your PATH${NC}"
    echo ""
    echo "Add this to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo ""
echo -e "${YELLOW}Step 4: Creating Native Messaging manifests...${NC}"

# Detect installed browsers
BROWSERS=()
BROWSER_DIRS=()

if [ -d "$HOME/.config/google-chrome" ]; then
    BROWSERS+=("Chrome")
    BROWSER_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
fi

if [ -d "$HOME/.config/chromium" ]; then
    BROWSERS+=("Chromium")
    BROWSER_DIRS+=("$HOME/.config/chromium/NativeMessagingHosts")
fi

if [ -d "$HOME/.config/BraveSoftware/Brave-Browser" ]; then
    BROWSERS+=("Brave")
    BROWSER_DIRS+=("$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
fi

if [ -d "$HOME/.config/microsoft-edge" ]; then
    BROWSERS+=("Edge")
    BROWSER_DIRS+=("$HOME/.config/microsoft-edge/NativeMessagingHosts")
fi

if [ ${#BROWSERS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠ No Chromium-based browsers detected${NC}"
    echo "Creating manifest for Chrome anyway..."
    BROWSERS+=("Chrome")
    BROWSER_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
fi

echo -e "${CYAN}Installing for: ${BROWSERS[*]}${NC}"

# Create manifests for each browser
for BROWSER_DIR in "${BROWSER_DIRS[@]}"; do
    mkdir -p "$BROWSER_DIR"
    MANIFEST_PATH="$BROWSER_DIR/com.inboxkey.bridge.json"

    cat > "$MANIFEST_PATH" <<EOF
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge Native Messaging Host for IMAP Support",
  "path": "$INSTALL_DIR/inboxbridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://mioicbneapdjamkppcidooggnmegpocn/"
  ]
}
EOF

    echo -e "${GREEN}✓ Created: $MANIFEST_PATH${NC}"
done

echo ""
echo -e "${YELLOW}Step 5: Verifying installation...${NC}"

# Test binary execution
echo "Testing binary with bridge.ping..."
PING_REQUEST='{"v":1,"id":"test-1","method":"bridge.ping","params":{}}'
PING_RESPONSE=$(echo "$PING_REQUEST" | "$INSTALL_DIR/inboxbridge" 2>&1 || true)

if echo "$PING_RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}✓ Binary test PASSED!${NC}"

    # Extract version info if available
    VERSION=$(echo "$PING_RESPONSE" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo -e "${CYAN}  Version: $VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Binary test inconclusive. Response:${NC}"
    echo "$PING_RESPONSE"
fi

# Check manifest is readable
FIRST_MANIFEST="${BROWSER_DIRS[0]}/com.inboxkey.bridge.json"
if [ -f "$FIRST_MANIFEST" ]; then
    EXTENSION_ID=$(grep -o 'chrome-extension://[^/]*' "$FIRST_MANIFEST" | head -1)
    echo -e "${GREEN}✓ Manifest readable${NC}"
    echo -e "${CYAN}  Extension ID: $EXTENSION_ID${NC}"
else
    echo -e "${RED}✗ Manifest not found!${NC}"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "1. ${YELLOW}Close ALL browser windows${NC} (including background processes)"
echo "   - For Chrome/Chromium: Use browser menu → Exit"
echo "   - Or: killall chrome chromium brave"
echo ""
echo "2. ${YELLOW}Restart your browser${NC}"
echo ""
echo "3. ${YELLOW}Load the InboxKey extension:${NC}"
echo "   - Go to: chrome://extensions"
echo "   - Enable 'Developer mode' (top right)"
echo "   - Click 'Load unpacked'"
echo "   - Select the extension build directory"
echo ""
echo "4. ${YELLOW}Test IMAP connection:${NC}"
echo "   - Click InboxKey extension icon"
echo "   - Go to 'Accounts' tab"
echo "   - Click 'Add IMAP'"
echo "   - Fill in your IMAP details"
echo "   - Click 'Test Connection'"
echo ""
echo -e "${CYAN}Files installed:${NC}"
echo "  Binary: $INSTALL_DIR/inboxbridge"
for BROWSER_DIR in "${BROWSER_DIRS[@]}"; do
    echo "  Manifest: $BROWSER_DIR/com.inboxkey.bridge.json"
done
echo ""
echo -e "${CYAN}Troubleshooting:${NC}"
echo "  • ${YELLOW}If 'InboxBridge not installed':${NC}"
echo "    1. Check extension ID matches in manifest"
echo "    2. Make sure browser is completely restarted"
echo "    3. Check: cat \"$FIRST_MANIFEST\""
echo "    4. Verify binary is executable: ls -la \"$INSTALL_DIR/inboxbridge\""
echo ""
echo "  • ${YELLOW}If 'Authentication failed':${NC}"
echo "    ✓ SUCCESS! This means InboxBridge is working!"
echo "    ✗ Error is just wrong credentials (expected for test)"
echo ""
echo "  • ${YELLOW}If 'Keychain access error':${NC}"
echo "    1. Make sure GNOME Keyring or KWallet is running"
echo "    2. Check: systemctl --user status gnome-keyring-daemon"
echo "    3. Or install: sudo apt install gnome-keyring seahorse"
echo ""
echo "  • ${YELLOW}For Gmail/Yahoo/Outlook:${NC}"
echo "    Use app-specific password, not your regular password"
echo "    Gmail: https://myaccount.google.com/apppasswords"
echo ""
echo -e "${CYAN}Uninstall:${NC}"
echo "  rm \"$INSTALL_DIR/inboxbridge\""
for BROWSER_DIR in "${BROWSER_DIRS[@]}"; do
    echo "  rm \"$BROWSER_DIR/com.inboxkey.bridge.json\""
done
echo ""
