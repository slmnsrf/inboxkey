#!/bin/bash
#
# InboxBridge Installation Verification Script
#
# Run this AFTER the Windows PowerShell script to verify everything is working
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "InboxBridge Installation Verification"
echo "========================================="
echo ""

# Check binary exists
echo -e "${YELLOW}Checking Windows binary...${NC}"
if [ -f "/mnt/c/Program Files/InboxBridge/inboxbridge.exe" ]; then
    SIZE=$(ls -lh "/mnt/c/Program Files/InboxBridge/inboxbridge.exe" | awk '{print $5}')
    echo -e "${GREEN}✓ Binary exists (${SIZE})${NC}"
else
    echo -e "${RED}✗ Binary not found!${NC}"
    echo "  Expected: C:\\Program Files\\InboxBridge\\inboxbridge.exe"
    exit 1
fi

# Check manifest exists
echo -e "${YELLOW}Checking manifest...${NC}"
if [ -f "/mnt/c/Program Files/InboxBridge/com.inboxkey.bridge.json" ]; then
    echo -e "${GREEN}✓ Manifest exists${NC}"

    # Show manifest content
    echo ""
    echo "Manifest content:"
    cat "/mnt/c/Program Files/InboxBridge/com.inboxkey.bridge.json" | jq '.'

    # Extract extension ID
    EXT_ID=$(cat "/mnt/c/Program Files/InboxBridge/com.inboxkey.bridge.json" | jq -r '.allowed_origins[0]')
    echo ""
    echo -e "${YELLOW}Extension ID in manifest: ${NC}${EXT_ID}"
else
    echo -e "${RED}✗ Manifest not found!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Verification Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps in Chrome:${NC}"
echo "1. Make sure Chrome is COMPLETELY closed and restarted"
echo "2. Go to: chrome://extensions"
echo "3. Enable 'Developer mode' (top right)"
echo "4. Click 'Load unpacked'"
echo "5. Navigate to: \\\\wsl\$\\Ubuntu\\home\\dev\\work\\inboxkey\\extension\\build\\chrome-mv3-prod"
echo "6. Verify the extension ID matches: ${EXT_ID}"
echo ""
echo -e "${YELLOW}Then test:${NC}"
echo "1. Click InboxKey extension icon"
echo "2. Go to Accounts tab"
echo "3. Click 'Add IMAP'"
echo "4. Enter test credentials and click 'Test Connection'"
echo "   - If you see 'Authentication failed': SUCCESS! (connection works)"
echo "   - If you see 'InboxBridge not installed': Check extension ID matches manifest"
echo ""
