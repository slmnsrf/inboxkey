#!/bin/bash
# build-pkg.sh -- creates a macOS .pkg installer from a compiled binary
# Usage: ./build-pkg.sh <universal-binary-path> <version>
# Example: ./build-pkg.sh ../../target/universal/inboxbridge 1.0.0

set -e

BINARY="$1"
VERSION="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$BINARY" ] || [ -z "$VERSION" ]; then
  echo "Usage: $0 <binary-path> <version>"
  exit 1
fi

if [ ! -f "$BINARY" ]; then
  echo "ERROR: Binary not found at $BINARY"
  exit 1
fi

# Create payload directory
PAYLOAD_DIR=$(mktemp -d)
mkdir -p "$PAYLOAD_DIR/usr/local/bin"
cp "$BINARY" "$PAYLOAD_DIR/usr/local/bin/inboxbridge"
chmod +x "$PAYLOAD_DIR/usr/local/bin/inboxbridge"

# Build package
OUTPUT="InboxBridge-v${VERSION}-macos-universal.pkg"
pkgbuild \
  --root "$PAYLOAD_DIR" \
  --scripts "$SCRIPT_DIR/scripts" \
  --identifier com.inboxkey.bridge \
  --version "$VERSION" \
  --install-location / \
  "$OUTPUT"

# Cleanup
rm -rf "$PAYLOAD_DIR"

echo "Created: $OUTPUT"
