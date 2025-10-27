# InboxBridge Setup Guide

**InboxBridge** is a native messaging host that enables InboxKey to connect to IMAP email accounts. This guide covers installation for **Windows**, **macOS**, and **Linux**.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Windows Setup](#windows-setup)
- [macOS Setup](#macos-setup)
- [Linux Setup](#linux-setup)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)

---

## Quick Start

Choose your platform and run the corresponding setup script:

| Platform | Command | Time |
|----------|---------|------|
| **Windows** (WSL) | `./setup-windows.sh` then run PowerShell script | 3-5 min |
| **macOS** | `./setup-macos.sh` | 2-3 min |
| **Linux** | `./setup-linux.sh` | 2-3 min |

All scripts handle:
- ✅ Dependency installation
- ✅ Building the binary
- ✅ Installing to correct location
- ✅ Creating Native Messaging manifest
- ✅ Testing the installation

---

## Windows Setup

### Prerequisites

- **WSL (Windows Subsystem for Linux)** with Ubuntu installed
- **Rust** installed in WSL (`rustup`)
- **PowerShell** (run as Administrator)

### Installation Steps

**Step 1: Build in WSL**

```bash
cd /path/to/inboxbridge
./setup-windows.sh
```

This script:
- Installs Windows build tools (`mingw-w64`)
- Builds InboxBridge for Windows (x86_64)
- Copies binary to `C:\Program Files\InboxBridge\`
- Creates PowerShell installer on your Desktop

**Step 2: Install in Windows**

1. Open PowerShell as **Administrator** (Win+X → PowerShell (Admin))
2. Run the installer:
   ```powershell
   cd ~\Desktop
   .\install-inboxbridge.ps1
   ```

This script:
- Registers Native Messaging manifest in Windows Registry
- Tests the binary with `bridge.ping`
- Verifies installation

**Step 3: Load Extension**

1. **Close ALL Chrome windows** (important!)
2. Restart Chrome
3. Go to `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Navigate to: `\\wsl$\Ubuntu\home\dev\work\inboxkey\extension\build\chrome-mv3-prod`

### Files Installed

| File | Location |
|------|----------|
| Binary | `C:\Program Files\InboxBridge\inboxbridge.exe` |
| Manifest | `C:\Program Files\InboxBridge\com.inboxkey.bridge.json` |
| Registry | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge` |

---

## macOS Setup

### Prerequisites

- **macOS** (Intel or Apple Silicon)
- **Rust** installed via rustup
- **Xcode Command Line Tools** (`xcode-select --install`)

### Installation Steps

**Single Command:**

```bash
cd /path/to/inboxbridge
./setup-macos.sh
```

This script:
- Auto-detects architecture (Intel vs Apple Silicon)
- Installs Rust target (`x86_64-apple-darwin` or `aarch64-apple-darwin`)
- Builds InboxBridge
- Installs binary to `~/Library/Application Support/InboxBridge/`
- Creates Native Messaging manifest for Chrome
- Tests with `bridge.ping`

**Load Extension:**

1. **Quit Chrome completely** (Cmd+Q)
2. Restart Chrome
3. Go to `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extension build directory

### Files Installed

| File | Location |
|------|----------|
| Binary | `~/Library/Application Support/InboxBridge/inboxbridge` |
| Manifest | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json` |

---

## Linux Setup

### Prerequisites

- **Rust** installed via rustup
- **pkg-config** and **libssl-dev** (or equivalent)
- **GNOME Keyring** or **KWallet** (for secure password storage)

### Installation Steps

**Single Command:**

```bash
cd /path/to/inboxbridge
./setup-linux.sh
```

This script:
- Checks for dependencies (Secret Service, pkg-config, OpenSSL)
- Builds InboxBridge for Linux
- Installs binary to `~/.local/bin/`
- Creates manifests for all detected browsers (Chrome, Chromium, Brave, Edge)
- Tests with `bridge.ping`

**Install Dependencies (if needed):**

```bash
# Ubuntu/Debian
sudo apt install pkg-config libssl-dev gnome-keyring libsecret-1-0

# Fedora/RHEL
sudo dnf install pkg-config openssl-devel gnome-keyring libsecret

# Arch/Manjaro
sudo pacman -S pkg-config openssl gnome-keyring libsecret
```

**Load Extension:**

1. Close **all** browser windows
2. Restart browser
3. Go to `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extension build directory

### Files Installed

| File | Location |
|------|----------|
| Binary | `~/.local/bin/inboxbridge` |
| Chrome Manifest | `~/.config/google-chrome/NativeMessagingHosts/com.inboxkey.bridge.json` |
| Chromium Manifest | `~/.config/chromium/NativeMessagingHosts/com.inboxkey.bridge.json` |
| Brave Manifest | `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.inboxkey.bridge.json` |
| Edge Manifest | `~/.config/microsoft-edge/NativeMessagingHosts/com.inboxkey.bridge.json` |

---

## Verification

### Test 1: Bridge.Ping (Command Line)

Test the binary directly:

**macOS/Linux:**
```bash
echo '{"v":1,"id":"test-1","method":"bridge.ping","params":{}}' | ~/.local/bin/inboxbridge
# or (macOS)
echo '{"v":1,"id":"test-1","method":"bridge.ping","params":{}}' | ~/Library/Application\ Support/InboxBridge/inboxbridge
```

**Windows (PowerShell):**
```powershell
echo '{"v":1,"id":"test-1","method":"bridge.ping","params":{}}' | & "C:\Program Files\InboxBridge\inboxbridge.exe"
```

**Expected Output:**
```json
{"v":1,"id":"test-1","result":{"ok":true,"version":"1.0.0","protocolVersion":1}}
```

### Test 2: Extension Connection

1. Open InboxKey extension
2. Go to **Accounts** tab
3. Click **Add IMAP**
4. Enter **dummy credentials**:
   ```
   Email: test@example.com
   Server: imap.gmail.com
   Port: 993
   Password: wrong-password
   TLS: ✓ Enabled
   ```
5. Click **Test Connection**

**Expected Results:**

| Message | Meaning | Status |
|---------|---------|--------|
| "Authentication failed" | ✅ **SUCCESS!** InboxBridge is working! | Proceed to real credentials |
| "InboxBridge not installed" | ❌ Extension can't find InboxBridge | See [Troubleshooting](#troubleshooting) |
| "Cannot connect to InboxBridge" | ❌ Binary not responding | See [Troubleshooting](#troubleshooting) |

### Test 3: Real IMAP Connection

**For Gmail:**
1. Go to https://myaccount.google.com/apppasswords
2. Generate app-specific password
3. Use that password (not your Gmail password)

**Test in extension:**
```
Email: your-email@gmail.com
Server: imap.gmail.com
Port: 993
Password: [16-char app password, no spaces]
TLS: ✓ Enabled
```

Expected: **"Connection successful!"** ✓

---

## Troubleshooting

### "InboxBridge not installed"

**Cause:** Extension ID mismatch or browser not restarted.

**Fix:**

1. **Check Extension ID:**
   - Go to `chrome://extensions`
   - Copy the Extension ID (e.g., `abcdefgh12345678...`)

2. **Update Manifest:**

   **macOS:**
   ```bash
   nano ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json
   ```

   **Linux:**
   ```bash
   nano ~/.config/google-chrome/NativeMessagingHosts/com.inboxkey.bridge.json
   ```

   **Windows:**
   ```
   notepad "C:\Program Files\InboxBridge\com.inboxkey.bridge.json"
   ```

   Replace `chrome-extension://mioicbneapdjamkppcidooggnmegpocn/` with your Extension ID.

3. **Restart Browser Completely:**
   - macOS: Cmd+Q
   - Linux: `killall chrome` or browser menu → Exit
   - Windows: Close all windows, check Task Manager

---

### "Cannot connect to InboxBridge" / Binary Not Responding

**Cause:** Binary not executable or missing dependencies.

**Fix:**

**macOS/Linux:**
```bash
# Check if binary exists
ls -la ~/.local/bin/inboxbridge  # Linux
ls -la ~/Library/Application\ Support/InboxBridge/inboxbridge  # macOS

# Make executable if needed
chmod +x ~/.local/bin/inboxbridge  # Linux
chmod +x ~/Library/Application\ Support/InboxBridge/inboxbridge  # macOS

# Test directly
~/.local/bin/inboxbridge --help  # Should not crash
```

**Windows:**
```powershell
# Check if binary exists
Test-Path "C:\Program Files\InboxBridge\inboxbridge.exe"

# Test directly
& "C:\Program Files\InboxBridge\inboxbridge.exe" --help
```

**If binary crashes on macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install
```

**If binary crashes on Linux:**
```bash
# Check for missing libraries
ldd ~/.local/bin/inboxbridge

# Install missing dependencies
sudo apt install libssl1.1  # Ubuntu/Debian
sudo dnf install openssl-libs  # Fedora
```

---

### "Keychain access error" (Linux)

**Cause:** Secret Service not running.

**Fix:**

```bash
# Check if GNOME Keyring is running
systemctl --user status gnome-keyring-daemon

# If not running, install and start
sudo apt install gnome-keyring seahorse
systemctl --user start gnome-keyring-daemon
```

**Alternative (KDE):**
```bash
sudo apt install kwalletmanager
# KWallet should start automatically
```

---

### "Authentication failed" with Real Credentials

**For Gmail/Yahoo/Outlook:**
- ✅ **Must use app-specific password**, not regular password
- Gmail: https://myaccount.google.com/apppasswords
- Yahoo: https://login.yahoo.com/account/security/app-passwords
- Outlook: https://account.microsoft.com/security

**Check IMAP is enabled:**
- Gmail: https://mail.google.com/mail/u/0/#settings/fwdandpop → Enable IMAP

**Check network access:**
```bash
# Test port 993 is reachable
telnet imap.gmail.com 993  # Should connect
# Or
nc -zv imap.gmail.com 993  # Should show "succeeded"
```

---

## Uninstall

### Windows

**PowerShell (as Administrator):**
```powershell
# Remove registry key
Remove-Item "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge" -Force

# Remove files
Remove-Item "C:\Program Files\InboxBridge" -Recurse -Force
```

### macOS

```bash
rm -rf ~/Library/Application\ Support/InboxBridge
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json
```

### Linux

```bash
rm ~/.local/bin/inboxbridge
rm ~/.config/google-chrome/NativeMessagingHosts/com.inboxkey.bridge.json
rm ~/.config/chromium/NativeMessagingHosts/com.inboxkey.bridge.json
rm ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.inboxkey.bridge.json
rm ~/.config/microsoft-edge/NativeMessagingHosts/com.inboxkey.bridge.json
```

---

## Platform Support Matrix

| Feature | Windows | macOS | Linux |
|---------|---------|-------|-------|
| **Binary Build** | ✅ x86_64 | ✅ Intel + Apple Silicon | ✅ x86_64 |
| **Keychain Storage** | ✅ Credential Manager | ✅ Keychain | ✅ Secret Service |
| **Browsers** | Chrome, Edge | Chrome, Brave, Edge | Chrome, Chromium, Brave, Edge |
| **Auto Setup Script** | ✅ (WSL + PowerShell) | ✅ Single script | ✅ Single script |

---

## Security Notes

- **Credentials stored locally:** InboxBridge stores IMAP passwords in your OS keychain (Credential Manager on Windows, Keychain on macOS, Secret Service on Linux).
- **No cloud/servers:** All email parsing happens on your device. Nothing leaves your computer.
- **Extension isolation:** The Native Messaging manifest whitelists only the InboxKey extension ID. Other extensions cannot access InboxBridge.
- **TLS encryption:** IMAP connections use TLS/SSL (port 993) by default.

---

## FAQ

**Q: Do I need to keep the terminal open?**
A: No. After installation, InboxBridge runs on-demand when the extension needs it.

**Q: Can I use this with other extensions?**
A: No. The Native Messaging manifest is locked to InboxKey's extension ID for security.

**Q: How do I update InboxBridge?**
A: Pull latest code and re-run the setup script. It will rebuild and replace the binary.

**Q: What happens if I rebuild the extension?**
A: The extension ID changes when rebuilt. You must update the `allowed_origins` in the manifest.

**Q: Does this work with Firefox?**
A: Not yet. Firefox uses a different Native Messaging location. Support planned for future release.

---

## Support

**Logs:**
- **Windows:** `%LOCALAPPDATA%\Google\Chrome\User Data\chrome_debug.log`
- **macOS:** `~/Library/Application Support/Google/Chrome/chrome_debug.log`
- **Linux:** `~/.config/google-chrome/chrome_debug.log`

**Verification Script:**
```bash
./verify-installation.sh
```

**Manual Test:**
```bash
# Create test request
cat > /tmp/test-request.json <<EOF
{"v":1,"id":"test","method":"bridge.ping","params":{}}
EOF

# Test binary
cat /tmp/test-request.json | /path/to/inboxbridge
```

---

**Version:** 1.0.0
**Last Updated:** 2025-10-26
**Platforms:** Windows 10/11, macOS 10.15+, Linux (Ubuntu 20.04+, Fedora 35+, Arch)
