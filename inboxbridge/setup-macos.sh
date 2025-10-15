#!/bin/bash
#
# InboxBridge macOS Setup Script
#
# This script:
# 1. Detects macOS architecture (Intel vs Apple Silicon)
# 2. Installs Rust target for macOS
# 3. Builds InboxBridge for macOS
# 4. Installs binary to user directory
# 5. Creates Native Messaging manifest for Chrome
# 6. Tests the installation
#
# Run this script directly on macOS (not in a VM or container)
#

set -e  # Exit on error

echo "========================================="
echo "InboxBridge macOS Setup"
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

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    RUST_TARGET="aarch64-apple-darwin"
    ARCH_NAME="Apple Silicon (M1/M2/M3)"
elif [ "$ARCH" = "x86_64" ]; then
    RUST_TARGET="x86_64-apple-darwin"
    ARCH_NAME="Intel"
else
    echo -e "${RED}ERROR: Unsupported architecture: $ARCH${NC}"
    exit 1
fi

echo -e "${CYAN}Detected: $ARCH_NAME${NC}"
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

echo -e "${YELLOW}Step 1: Installing Rust target for macOS...${NC}"
if ! rustup target list --installed | grep -q "$RUST_TARGET"; then
    echo "Installing Rust target: $RUST_TARGET..."
    rustup target add "$RUST_TARGET"
else
    echo "✓ Target already installed: $RUST_TARGET"
fi

echo ""
echo -e "${YELLOW}Step 2: Building InboxBridge for macOS...${NC}"
cargo build --release --target "$RUST_TARGET"

# Check if build succeeded
BINARY_PATH="target/$RUST_TARGET/release/inboxbridge"
if [ ! -f "$BINARY_PATH" ]; then
    echo -e "${RED}✗ Build failed! Binary not found at: $BINARY_PATH${NC}"
    exit 1
fi

BINARY_SIZE=$(ls -lh "$BINARY_PATH" | awk '{print $5}')
echo -e "${GREEN}✓ Build successful! Binary size: $BINARY_SIZE${NC}"

echo ""
echo -e "${YELLOW}Step 3: Installing binary...${NC}"

# Install to user's local bin directory
INSTALL_DIR="$HOME/Library/Application Support/InboxBridge"
mkdir -p "$INSTALL_DIR"

cp "$BINARY_PATH" "$INSTALL_DIR/inboxbridge"
chmod +x "$INSTALL_DIR/inboxbridge"

echo -e "${GREEN}✓ Binary installed to: $INSTALL_DIR/inboxbridge${NC}"

echo ""
echo -e "${YELLOW}Step 4: Creating Native Messaging manifest...${NC}"

# Create Chrome Native Messaging directory
CHROME_NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$CHROME_NM_DIR"

# Create manifest
MANIFEST_PATH="$CHROME_NM_DIR/com.inboxkey.bridge.json"
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

echo -e "${GREEN}✓ Manifest created: $MANIFEST_PATH${NC}"

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
if [ -f "$MANIFEST_PATH" ]; then
    EXTENSION_ID=$(grep -o 'chrome-extension://[^/]*' "$MANIFEST_PATH" | head -1)
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
echo "1. ${YELLOW}Close ALL Chrome windows${NC} (including background processes)"
echo "   - Press Cmd+Q to quit Chrome completely"
echo ""
echo "2. ${YELLOW}Restart Chrome${NC}"
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
echo "  Manifest: $MANIFEST_PATH"
echo ""
echo -e "${CYAN}Troubleshooting:${NC}"
echo "  • ${YELLOW}If 'InboxBridge not installed':${NC}"
echo "    1. Check extension ID matches in manifest"
echo "    2. Make sure Chrome is completely restarted"
echo "    3. Check: cat \"$MANIFEST_PATH\""
echo ""
echo "  • ${YELLOW}If 'Authentication failed':${NC}"
echo "    ✓ SUCCESS! This means InboxBridge is working!"
echo "    ✗ Error is just wrong credentials (expected for test)"
echo ""
echo "  • ${YELLOW}For Gmail/Yahoo/Outlook:${NC}"
echo "    Use app-specific password, not your regular password"
echo "    Gmail: https://myaccount.google.com/apppasswords"
echo ""
echo -e "${CYAN}Uninstall:${NC}"
echo "  rm -rf \"$INSTALL_DIR\""
echo "  rm \"$MANIFEST_PATH\""
echo ""
