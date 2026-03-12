#!/bin/bash
# UI Testing Helper Script
# Captures screenshots of the extension UI for visual regression testing

set -e

echo "🎭 InboxKey UI Testing Script"
echo "=============================="
echo ""

# Check if build exists
if [ ! -d "build/chrome-mv3-prod" ]; then
    echo "⚠️  Build directory not found. Building extension..."
    npm run build
fi

# Run screenshot capture
echo "📸 Capturing screenshots..."
xvfb-run -a node scripts/screenshot-security.mjs

echo ""
echo "✅ Screenshots captured successfully!"
echo "   - security-light.png"
echo "   - security-dark.png"
echo ""
echo "You can find them in: /home/dev/work/inboxkey/"
