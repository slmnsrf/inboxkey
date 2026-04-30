# Installing InboxBridge Native Messaging Manifest

## Overview

For the InboxKey extension to communicate with the InboxBridge native app, you need to install a Native Messaging manifest that tells Chrome where to find the InboxBridge binary.

---

## Prerequisites

1. InboxBridge binary built: `/inboxbridge/target/release/inboxbridge`
2. Extension installed in Chrome (to get Extension ID)
3. Manifest file: `/inboxbridge/com.inboxkey.bridge.json`

---

## Step 1: Get Your Extension ID

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Find "InboxKey" extension
5. Copy the **Extension ID** (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

---

## Step 2: Update Manifest with Extension ID

Edit `/inboxbridge/com.inboxkey.bridge.json`:

```json
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge Native Messaging Host for IMAP Support",
  "path": "/ABSOLUTE/PATH/TO/inboxbridge/target/release/inboxbridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID_HERE/"
  ]
}
```

**IMPORTANT:**
- Replace `YOUR_EXTENSION_ID_HERE` with your actual extension ID
- Replace `/ABSOLUTE/PATH/TO/` with the full absolute path to the binary
- Keep the trailing slash in `chrome-extension://...  /`

---

## Step 3: Install Manifest

### macOS

```bash
# Create directory
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

# Copy manifest (with YOUR extension ID)
cp com.inboxkey.bridge.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Verify
ls -la ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

### Linux

```bash
# Create directory
mkdir -p ~/.config/google-chrome/NativeMessagingHosts

# Copy manifest
cp com.inboxkey.bridge.json ~/.config/google-chrome/NativeMessagingHosts/

# Verify
ls -la ~/.config/google-chrome/NativeMessagingHosts/
```

### Windows

```powershell
# Create registry entry
# 1. Edit com.inboxkey.bridge.json with Windows path:
#    "path": "C:\\Users\\YourName\\inboxkey\\inboxbridge\\target\\release\\inboxbridge.exe"

# 2. Save manifest to: C:\Program Files\InboxBridge\com.inboxkey.bridge.json

# 3. Create registry key:
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge" /ve /t REG_SZ /d "C:\Program Files\InboxBridge\com.inboxkey.bridge.json" /f
```

---

## Step 4: Test Connection

### Method 1: From Extension

1. Open InboxKey extension popup
2. Go to Accounts tab
3. Click "Add IMAP" button
4. Click "Test Connection" (with any credentials)
5. If you see "InboxBridge not installed" → manifest not found
6. If you see "Authentication failed" → SUCCESS! (bridge connected)

### Method 2: Check Chrome Logs

```bash
# macOS/Linux
tail -f ~/Library/Application\ Support/Google/Chrome/chrome_debug.log

# Look for:
# "Native Messaging host com.inboxkey.bridge has exited" (if working)
# "Can't find native messaging host com.inboxkey.bridge" (if not installed)
```

---

## Troubleshooting

### Error: "InboxBridge not installed"

**Causes:**
1. Manifest not in correct location
2. Manifest has wrong extension ID
3. Manifest has wrong path to binary
4. Binary doesn't have execute permissions

**Solutions:**
```bash
# Check manifest location
ls -la ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json

# Check extension ID in manifest
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json

# Check binary path and permissions
ls -la /path/to/inboxbridge/target/release/inboxbridge

# Make binary executable
chmod +x /path/to/inboxbridge/target/release/inboxbridge
```

### Error: "Failed to start native messaging host"

**Cause:** Binary path incorrect or binary won't execute

**Solution:**
```bash
# Test binary directly
echo '{"v":1,"id":"test","method":"bridge.ping","params":{}}' | \
  /path/to/inboxbridge/target/release/inboxbridge

# Should output:
# {"v":1,"id":"test","result":{"ok":true,"version":"1.0.0",...}}
```

### Error: "Extension ID not allowed"

**Cause:** Extension ID in manifest doesn't match actual extension

**Solution:**
1. Get correct extension ID from `chrome://extensions`
2. Update manifest `allowed_origins` array
3. Reinstall manifest (copy to NativeMessagingHosts directory)
4. Restart Chrome

---

## Verification Checklist

- [ ] InboxBridge binary built and executable
- [ ] Extension installed and ID copied
- [ ] Manifest file updated with:
  - [ ] Correct extension ID
  - [ ] Absolute path to binary
  - [ ] Trailing slash in extension URL
- [ ] Manifest copied to Native Messaging directory
- [ ] Chrome restarted (important!)
- [ ] Extension can connect to bridge
- [ ] "Add IMAP" button shows modal (not "not installed" error)

---

## Platform-Specific Manifest Locations

| Platform | Manifest Location |
|----------|-------------------|
| **macOS** | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |
| **Linux** | `~/.config/google-chrome/NativeMessagingHosts/` |
| **Windows** | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge` |

---

## Development vs Production

### Development (Current Setup)
- Manifest points to: `/home/dev/work/inboxkey/inboxbridge/target/release/inboxbridge`
- Extension loaded unpacked from: `/home/dev/work/inboxkey/extension/build/chrome-mv3-prod`
- Each developer needs their own manifest with their extension ID

### Production (Future)
- Manifest distributed with installer
- Binary installed to: `/usr/local/bin/inboxbridge` (macOS/Linux) or `C:\Program Files\InboxBridge\` (Windows)
- Extension published to Chrome Web Store (fixed extension ID)
- Installer automatically:
  1. Copies binary to standard location
  2. Creates manifest with published extension ID
  3. Installs manifest to Native Messaging directory

---

## Next Steps

1. Follow steps 1-4 above to install manifest
2. Test connection from extension
3. If working, proceed to add IMAP accounts
4. If not working, check troubleshooting section

**Note:** You must restart Chrome after installing/updating the manifest!
