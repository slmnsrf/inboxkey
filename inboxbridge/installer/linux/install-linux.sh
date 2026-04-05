#!/bin/bash
# InboxBridge install script for Linux (release archive)
# This installs a pre-built binary. It does NOT build from source.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/inboxbridge"
EXTENSION_ID="mioicbneapdjamkppcidooggnmegpocn"
INSTALL_DIR="$HOME/.local/bin"

echo "=== InboxBridge Installer (Linux) ==="
echo ""

# Check binary exists
if [ ! -f "$BINARY" ]; then
  echo "ERROR: inboxbridge binary not found next to this script."
  exit 1
fi

# Check Secret Service (runtime dependency for keychain)
if ! command -v gnome-keyring-daemon &> /dev/null && \
   ! command -v seahorse &> /dev/null && \
   ! command -v kwallet-query &> /dev/null; then
  echo "WARNING: No Secret Service provider detected (GNOME Keyring or KWallet)."
  echo "InboxBridge needs one to store credentials securely."
  echo ""
  echo "Install with: sudo apt install gnome-keyring libsecret-1-0"
  echo "         or:  sudo dnf install gnome-keyring libsecret"
  echo ""
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

# Install binary
mkdir -p "$INSTALL_DIR"
cp "$BINARY" "$INSTALL_DIR/inboxbridge"
chmod +x "$INSTALL_DIR/inboxbridge"
echo "Binary installed to: $INSTALL_DIR/inboxbridge"

# Detect browsers and create manifests
BROWSERS=()
BROWSER_DIRS=()

[ -d "$HOME/.config/google-chrome" ] && BROWSERS+=("Chrome") && BROWSER_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
[ -d "$HOME/.config/chromium" ] && BROWSERS+=("Chromium") && BROWSER_DIRS+=("$HOME/.config/chromium/NativeMessagingHosts")
[ -d "$HOME/.config/BraveSoftware/Brave-Browser" ] && BROWSERS+=("Brave") && BROWSER_DIRS+=("$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts")
[ -d "$HOME/.config/microsoft-edge" ] && BROWSERS+=("Edge") && BROWSER_DIRS+=("$HOME/.config/microsoft-edge/NativeMessagingHosts")

if [ ${#BROWSERS[@]} -eq 0 ]; then
  echo "No Chromium browsers detected. Creating manifest for Chrome anyway."
  BROWSERS+=("Chrome")
  BROWSER_DIRS+=("$HOME/.config/google-chrome/NativeMessagingHosts")
fi

for BROWSER_DIR in "${BROWSER_DIRS[@]}"; do
  mkdir -p "$BROWSER_DIR"
  cat > "$BROWSER_DIR/com.inboxkey.bridge.json" <<EOF
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
done

echo "Manifests created for: ${BROWSERS[*]}"
echo ""
echo "Done! Close ALL browser windows and reopen your browser."
echo ""
