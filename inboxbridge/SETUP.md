# InboxBridge Windows Setup Guide

## Quick Start (3 Steps)

### Step 1: Run WSL Script (in WSL/Ubuntu terminal)

```bash
cd /home/dev/work/inboxkey/inboxbridge
./setup-windows.sh
```

**What it does:**
- Installs Windows build tools
- Builds InboxBridge for Windows (x86_64)
- Creates Native Messaging manifest
- Copies files to `C:\Program Files\InboxBridge\`
- Creates PowerShell install script on your Desktop

**Time:** 2-5 minutes (first time), 30 seconds (subsequent builds)

---

### Step 2: Run PowerShell Script (in Windows as Administrator)

1. Press `Win + X` → Select "Windows PowerShell (Admin)"
2. Run:
   ```powershell
   cd ~\Desktop
   .\install-inboxbridge.ps1
   ```

**What it does:**
- Installs Native Messaging manifest in Windows Registry
- Verifies binary works
- Tests `bridge.ping` protocol

**Time:** 30 seconds

---

### Step 3: Load Extension in Chrome

1. **Close ALL Chrome windows** (important!)
2. **Restart Chrome**
3. Go to: `chrome://extensions`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Navigate to: `\\wsl$\Ubuntu\home\dev\work\inboxkey\extension\build\chrome-mv3-prod`
7. Click "Select Folder"

**Time:** 2 minutes

---

## Testing the Connection

### Test 1: Dummy Credentials (Verify Connection Works)

1. Click InboxKey extension icon
2. Go to "Accounts" tab
3. Click "Add IMAP"
4. Enter:
   ```
   Email: test@example.com
   Server: imap.gmail.com
   Port: 993
   Password: wrong-password
   TLS: ✓ Enabled
   ```
5. Click "Test Connection"

**Expected Results:**

| What You See | Meaning | Status |
|--------------|---------|--------|
| "Authentication failed" | **✅ SUCCESS!** Connection works! | Proceed to Test 2 |
| "InboxBridge not installed" | ❌ Registry wrong or extension ID mismatch | See Troubleshooting |
| "InboxBridge not responding" | ❌ Binary won't execute | See Troubleshooting |

### Test 2: Real Gmail Credentials (Verify IMAP Works)

#### Setup Gmail App Password

1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification (if not already)
3. Search "App passwords"
4. Select "Mail" → "Windows Computer"
5. Click "Generate"
6. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

#### Test in Extension

1. Open "Add IMAP" modal
2. Enter:
   ```
   Email: your-email@gmail.com
   Server: imap.gmail.com
   Port: 993
   Password: [paste app password - remove spaces]
   TLS: ✓ Enabled
   ```
3. Click "Test Connection"

**Expected:** "Connection successful! ✓"

**If this works:** The entire stack is functional! 🎉

---

## Verification Script

After setup, verify installation:

```bash
cd /home/dev/work/inboxkey/inboxbridge
./verify-installation.sh
```

---

## Troubleshooting

### Error: "InboxBridge not installed"

**Check 1: Extension ID matches manifest**

In Chrome (`chrome://extensions`):
```
Extension ID: abcdefgh12345678...
```

In manifest (`C:\Program Files\InboxBridge\com.inboxkey.bridge.json`):
```json
{
  "allowed_origins": [
    "chrome-extension://abcdefgh12345678.../"
  ]
}
```

**If they don't match:**

1. Get the correct extension ID from `chrome://extensions`
2. Edit manifest in Windows: `C:\Program Files\InboxBridge\com.inboxkey.bridge.json`
3. Replace the extension ID in `allowed_origins`
4. Restart Chrome completely

**Check 2: Registry key exists**

In PowerShell:
```powershell
Get-ItemProperty "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge"
```

Should show:
```
(default) : C:\Program Files\InboxBridge\com.inboxkey.bridge.json
```

**If not:** Re-run the PowerShell install script.

**Check 3: Chrome was restarted**

Close ALL Chrome windows (including background processes) and restart.

---

### Error: "Binary won't execute" or "Failed to start"

**Check 1: Binary exists**

```powershell
Test-Path "C:\Program Files\InboxBridge\inboxbridge.exe"
```

Should return `True`.

**Check 2: Test binary directly**

```powershell
cd "C:\Program Files\InboxBridge"
.\inboxbridge.exe --help
```

Should not crash.

**Check 3: Install Visual C++ Redistributable**

Download and install:
https://aka.ms/vs/17/release/vc_redist.x64.exe

---

### Error: "Authentication failed" with real credentials

**Check 1: IMAP enabled in Gmail**

Go to: https://mail.google.com/mail/u/0/#settings/fwdandpop
Enable IMAP

**Check 2: Using App Password (not regular password)**

Generate new app password:
https://myaccount.google.com/security → App passwords

**Check 3: Network access to port 993**

```powershell
Test-NetConnection -ComputerName imap.gmail.com -Port 993
```

Should show: `TcpTestSucceeded : True`

---

## File Locations

| File | Location |
|------|----------|
| **Binary** | `C:\Program Files\InboxBridge\inboxbridge.exe` |
| **Manifest** | `C:\Program Files\InboxBridge\com.inboxkey.bridge.json` |
| **Registry** | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge` |
| **Extension** | `\\wsl$\Ubuntu\home\dev\work\inboxkey\extension\build\chrome-mv3-prod` |
| **Install Script** | `C:\Users\YourName\Desktop\install-inboxbridge.ps1` |

---

## Rebuilding After Code Changes

If you modify InboxBridge Rust code:

```bash
cd /home/dev/work/inboxkey/inboxbridge
./setup-windows.sh  # Rebuilds and copies to Windows
```

No need to re-run PowerShell script (registry stays the same).

**Don't forget to restart Chrome!**

---

## Uninstalling

### Windows PowerShell (Admin):

```powershell
# Remove registry key
Remove-Item "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge" -Force

# Remove files
Remove-Item "C:\Program Files\InboxBridge" -Recurse -Force
```

### Chrome:

Go to `chrome://extensions` → Remove InboxKey extension

---

## Next Steps After Connection Works

1. **Implement Backend Handler** - Wire `STORE_IMAP_MAILBOX` to actually save accounts
2. **Integrate Polling** - Add IMAP provider to email polling loop
3. **End-to-End Test** - Trigger verification code email and verify extraction works
4. **Beta Testing** - Share with 5-10 users for feedback

---

## Support

If you encounter issues not covered here:

1. Check Chrome Native Messaging logs:
   - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\chrome_debug.log`

2. Run verification script:
   ```bash
   ./verify-installation.sh
   ```

3. Test binary directly in PowerShell:
   ```powershell
   cd "C:\Program Files\InboxBridge"
   echo '{"v":1,"id":"test","method":"bridge.ping","params":{}}' | .\inboxbridge.exe
   ```

---

**Version:** 1.0
**Last Updated:** 2025-10-25
