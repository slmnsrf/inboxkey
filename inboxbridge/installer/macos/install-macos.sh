#!/bin/bash
# InboxBridge install script for macOS (release archive)
# This installs a pre-built binary. It does NOT build from source.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/inboxbridge"
EXTENSION_ID="mioicbneapdjamkppcidooggnmegpocn"
INSTALL_DIR="$HOME/Library/Application Support/InboxBridge"

echo "=== InboxBridge Installer (macOS) ==="
echo ""

# Check binary exists
if [ ! -f "$BINARY" ]; then
  echo "ERROR: inboxbridge binary not found next to this script."
  exit 1
fi

# Install binary
mkdir -p "$INSTALL_DIR"
cp "$BINARY" "$INSTALL_DIR/inboxbridge"
chmod +x "$INSTALL_DIR/inboxbridge"
echo "Binary installed to: $INSTALL_DIR/inboxbridge"

# Create Chrome NativeMessagingHosts manifest
NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$NM_DIR"

cat > "$NM_DIR/com.inboxkey.bridge.json" <<EOF
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge Native Messaging Host for IMAP Support",
  "path": "$INSTALL_DIR/inboxbridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
echo "Manifest created."

# Verify
echo ""
echo "Done! Close ALL Chrome windows and reopen Chrome."
echo ""
