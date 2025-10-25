# InboxBridge Technical Specification

> **Status:** Post-MVP (Phase 12)
> **Implementation Language:** Rust (recommended)
> **Estimated Effort:** 2-3 weeks
> **Target Release:** 6-12 months after MVP launch

---

## 1. Executive Summary

**InboxBridge** is a Native Messaging host that enables InboxKey to support any IMAP-compatible email provider (Yahoo, ProtonMail, Fastmail, custom servers, etc.). It runs as a local process on the user's computer and acts as a bridge between the browser extension and IMAP servers.

**Core Architecture:**
```
┌─────────────────────────────────────────────────────┐
│   InboxKey Extension (Chrome MV3)                   │
│   ┌───────────────────────────────────────────┐    │
│   │  providers/imapBridge.ts                   │    │
│   │  - Native Messaging client                 │    │
│   │  - JSON protocol handler                   │    │
│   └───────────────┬───────────────────────────┘    │
│                   │ chrome.runtime.connectNative    │
└───────────────────┼─────────────────────────────────┘
                    │ JSON over stdin/stdout
┌───────────────────▼─────────────────────────────────┐
│   InboxBridge (Rust Native App)                     │
│   ┌─────────────────────────────────────────┐      │
│   │  • IMAP client (async-imap)              │      │
│   │  • OS keychain (keyring crate)           │      │
│   │  • Extension ID whitelist                │      │
│   │  • JSON protocol handler                 │      │
│   └───────────────┬─────────────────────────┘      │
└───────────────────┼─────────────────────────────────┘
                    │ IMAP over TLS (port 993)
┌───────────────────▼─────────────────────────────────┐
│   IMAP Server (Gmail/Yahoo/ProtonMail/etc)          │
└──────────────────────────────────────────────────────┘
```

---

## 2. Why InboxBridge is Necessary

### Browser Security Constraint

**The Problem:**
- Web browsers intentionally block extensions from making direct TCP/TLS connections
- `XMLHttpRequest` and `fetch()` only support HTTP/HTTPS protocols
- IMAP uses a custom protocol over TCP port 993 (IMAPS) or 143 (IMAP + STARTTLS)
- WebSockets cannot be used because IMAP servers don't speak the WebSocket protocol

**The Only Solution: Chrome Native Messaging**
- Chrome's Native Messaging API allows extensions to communicate with native applications
- Native app runs with full OS permissions (can open arbitrary TCP sockets)
- Communication happens via JSON messages over stdin/stdout
- Extension sends JSON requests → Native app processes → Returns JSON responses

**Why Not a Cloud Proxy?**
- Would violate InboxKey's "100% local-only" promise
- Would require sending user IMAP credentials to a third-party server
- Would create a central point of failure and attack surface
- Would require ongoing server maintenance and costs

**Conclusion:** Native Messaging is the **only** way to support IMAP while maintaining InboxKey's privacy-first architecture.

---

## 3. Security Architecture

### 3.1 Extension ID Whitelisting

**Threat:** Malicious extensions could try to hijack InboxBridge to steal IMAP credentials.

**Mitigation:**
- Native Messaging manifest includes `allowed_origins` field
- Only accepts connections from InboxKey's exact extension ID
- Extension ID format: `chrome-extension://abcdefghijklmnopqrstuvwxyz123456/`
- **No wildcards allowed** — must match exactly

**Manifest Example:**
```json
{
  "name": "com.inboxkey.bridge",
  "allowed_origins": [
    "chrome-extension://abcdefghijklmnopqrstuvwxyz123456/"
  ]
}
```

### 3.2 Credential Storage (OS Keychain)

**Threat:** Plaintext credentials stored on disk could be stolen.

**Mitigation:**
- **NEVER** store IMAP passwords in plaintext or in the extension's storage
- Use OS-native credential storage (encrypted by the operating system):
  - **macOS:** Keychain Services (`Security.framework`)
  - **Windows:** Credential Manager (`CredWrite`/`CredRead` APIs)
  - **Linux:** libsecret (Secret Service API — GNOME Keyring / KDE Wallet)

**Security Properties:**
- Credentials are encrypted at the OS level (AES-256 or equivalent)
- Only accessible to the InboxBridge process (OS permission model)
- Cannot be read by other applications without elevated privileges
- Automatically cleared when InboxBridge is uninstalled (OS handles cleanup)

**Rust Implementation (using `keyring` crate):**
```rust
use keyring::{Entry, Error};

fn store_imap_password(email: &str, password: &str) -> Result<(), Error> {
    let entry = Entry::new("com.inboxkey.bridge", email)?;
    entry.set_password(password)
}

fn get_imap_password(email: &str) -> Result<String, Error> {
    let entry = Entry::new("com.inboxkey.bridge", email)?;
    entry.get_password()
}
```

### 3.3 No Network Exposure

**Threat:** Listening sockets could be exploited by local attackers.

**Mitigation:**
- InboxBridge has **no listening sockets** (no HTTP server, no WebSocket server)
- All IMAP connections are **outbound-only** (client initiates, server responds)
- Native Messaging uses stdin/stdout (no network stack involved)
- Process terminates when extension disconnects (no persistent daemon)

**Data Flow:**
```
IMAP Server → InboxBridge → Extension → User
(outbound only, no inbound connections)
```

### 3.4 Process Isolation

**Threat:** Extension sandbox escape or compromise could affect native app.

**Mitigation:**
- InboxBridge runs as a **separate process** outside the browser sandbox
- Chrome launches the process on-demand via Native Messaging
- Process terminates automatically when extension disconnects
- Uses minimal system privileges (no root/admin required)

---

## 4. Implementation Language: Rust

### Why Rust (Not Go or C++)

**Rust Advantages:**
1. **Memory Safety:** Prevents buffer overflows, use-after-free, data races at compile time
2. **Zero-Cost Abstractions:** Fast performance without runtime overhead
3. **Strong Typing:** Prevents protocol bugs and data corruption
4. **Mature Ecosystem:**
   - `async-imap`: Well-maintained IMAP client with async/await support
   - `keyring`: Cross-platform OS keychain access (macOS, Windows, Linux)
   - `tokio`: Battle-tested async runtime
   - `serde`: Excellent JSON serialization/deserialization

**Rust vs Go:**
| Feature | Rust | Go |
|---------|------|-----|
| Binary Size | 10-15MB | 20-30MB |
| Memory Safety | Compile-time | Runtime (GC) |
| OS Keychain | `keyring` crate (native) | Requires CGo (fragile) |
| Concurrency | `async`/`await` (tokio) | Goroutines (simple) |
| Learning Curve | Steep | Moderate |
| Compile Time | Slow (2-5 min) | Fast (<30s) |

**Recommendation:** **Rust** for memory safety and binary size, despite steeper learning curve.

---

## 5. IMAP Protocol Implementation

### 5.1 Key IMAP Operations

**1. Connect & Authenticate**
```
C: <connects to imap.gmail.com:993 over TLS>
S: * OK IMAP4rev1 Service Ready
C: a001 LOGIN "user@gmail.com" "app-password"
S: a001 OK LOGIN completed
```

**2. Select Mailbox**
```
C: a002 SELECT INBOX
S: * 172 EXISTS
S: * 1 RECENT
S: a002 OK [READ-WRITE] SELECT completed
```

**3. Search Recent Messages (Since Timestamp)**
```
C: a003 SEARCH SINCE 16-Oct-2025
S: * SEARCH 170 171 172
S: a003 OK SEARCH completed
```

**4. Fetch Message Metadata**
```
C: a004 FETCH 170:172 (FLAGS ENVELOPE INTERNALDATE)
S: * 170 FETCH (FLAGS (\Seen) ENVELOPE (...) INTERNALDATE "16-Oct-2025 10:30:00 +0000")
S: * 171 FETCH (...)
S: * 172 FETCH (...)
S: a004 OK FETCH completed
```

**5. Fetch Message Body**
```
C: a005 FETCH 172 (BODY.PEEK[TEXT])
S: * 172 FETCH (BODY[TEXT] {123}
S: Your verification code is: 123456
S: )
S: a005 OK FETCH completed
```

**Important:** Use `BODY.PEEK[]` instead of `BODY[]` to avoid marking messages as `\Seen`.

### 5.2 Rust IMAP Library (`async-imap`)

```rust
use async_imap::Client;
use async_native_tls::TlsConnector;
use async_std::net::TcpStream;

async fn connect_imap(server: &str, port: u16, email: &str, password: &str) -> Result<Client<TlsStream>, Error> {
    // Connect to IMAP server over TLS
    let tcp_stream = TcpStream::connect((server, port)).await?;
    let tls_connector = TlsConnector::new();
    let tls_stream = tls_connector.connect(server, tcp_stream).await?;

    // Create IMAP client
    let mut client = Client::new(tls_stream);

    // Wait for server greeting
    client.read_response().await?;

    // Authenticate
    client.login(email, password).await?;

    Ok(client)
}

async fn search_recent(client: &mut Client<TlsStream>, since_minutes: u32) -> Result<Vec<u32>, Error> {
    // Select INBOX
    client.select("INBOX").await?;

    // Calculate timestamp (now - since_minutes)
    let since_date = format_imap_date(Utc::now() - Duration::minutes(since_minutes as i64));

    // Search for messages
    let query = format!("SINCE {}", since_date);
    let message_ids = client.search(&query).await?;

    Ok(message_ids.iter().collect())
}

async fn fetch_message(client: &mut Client<TlsStream>, msg_id: u32) -> Result<EmailMessage, Error> {
    // Fetch envelope and body without marking as seen
    let messages = client.fetch(format!("{}", msg_id), "(ENVELOPE BODY.PEEK[TEXT])").await?;

    let msg = messages.iter().next().ok_or("Message not found")?;

    // Parse envelope (from, subject, date)
    let envelope = msg.envelope().ok_or("No envelope")?;
    let from = envelope.from.as_ref().and_then(|f| f.first()).map(|a| a.mailbox.as_ref()).unwrap_or("unknown");
    let subject = envelope.subject.as_ref().map(|s| String::from_utf8_lossy(s).to_string()).unwrap_or_default();

    // Parse body
    let body = msg.body().map(|b| String::from_utf8_lossy(b).to_string()).unwrap_or_default();

    Ok(EmailMessage {
        id: msg_id.to_string(),
        from: from.to_string(),
        subject,
        body,
        date: format_timestamp(envelope.date),
    })
}
```

### 5.3 Performance Optimizations

**1. Connection Pooling**
- Maintain a single IMAP connection per email account
- Reuse connection across multiple `listRecent` calls
- Close connection after 5 minutes of inactivity (send `LOGOUT`)

**2. Batch Fetching**
- Fetch multiple message IDs in one command: `FETCH 170:172 (...)`
- Reduces round-trips, improves latency

**3. Metadata-Only Queries**
- Use `ENVELOPE` instead of full `BODY[]` for initial filtering
- Only fetch full body for shortlisted candidates (top 5-10)

**4. IMAP IDLE (Future Enhancement)**
- Use IDLE command to receive real-time push notifications
- Eliminates polling, reduces server load
- Requires background thread to monitor IDLE responses

---

## 6. JSON Protocol Specification

### 6.1 Message Types (Extension → Native)

**Connect Request**
```typescript
{
  "type": "connect",
  "server": "imap.gmail.com",       // IMAP server hostname
  "port": 993,                      // IMAP port (993 for IMAPS)
  "email": "user@gmail.com",        // User's email address
  "password": "abcd efgh ijkl mnop" // App-specific password
}
```

**List Recent Request**
```typescript
{
  "type": "listRecent",
  "sinceMinutes": 10  // Fetch messages from last 10 minutes
}
```

**Get Message Request**
```typescript
{
  "type": "getMessage",
  "id": "172"  // IMAP message ID (from listRecent response)
}
```

**Disconnect Request**
```typescript
{
  "type": "disconnect"
}
```

### 6.2 Message Types (Native → Extension)

**Connect Response**
```typescript
{
  "type": "connect_response",
  "success": true,
  "error": null  // Or "AUTH_FAILED" | "NETWORK_ERROR" | "INVALID_SERVER"
}
```

**List Recent Response**
```typescript
{
  "type": "list_response",
  "messages": [
    {
      "id": "170",
      "from": "github@github.com",
      "subject": "Your verification code",
      "date": "2025-10-16T10:30:00Z"
    },
    {
      "id": "171",
      "from": "aws@amazon.com",
      "subject": "Login verification",
      "date": "2025-10-16T10:32:00Z"
    }
  ]
}
```

**Get Message Response**
```typescript
{
  "type": "message_response",
  "message": {
    "id": "172",
    "from": "github@github.com",
    "subject": "Your verification code",
    "date": "2025-10-16T10:30:00Z",
    "body": "Your verification code is: 123456"
  }
}
```

**Error Response**
```typescript
{
  "type": "error",
  "code": "AUTH_FAILED" | "CONNECTION_LOST" | "TIMEOUT" | "INVALID_REQUEST",
  "message": "Invalid credentials. Please check your app password."
}
```

### 6.3 Protocol Flow Example

```
Extension                     InboxBridge                   IMAP Server
    |                              |                               |
    |---connect------------------>|                               |
    |  {server, port, email, pw}  |                               |
    |                              |----LOGIN-------------------->|
    |                              |<---OK------------------------|
    |<--connect_response-----------|                               |
    |  {success: true}             |                               |
    |                              |                               |
    |---listRecent(10)----------->|                               |
    |                              |----SELECT INBOX------------->|
    |                              |----SEARCH SINCE------------->|
    |                              |<---* SEARCH 170 171 172------|
    |                              |----FETCH 170:172 (ENVELOPE)->|
    |                              |<---* FETCH results-----------|
    |<--list_response--------------|                               |
    |  {messages: [...]}           |                               |
    |                              |                               |
    |---getMessage(172)---------->|                               |
    |                              |----FETCH 172 (BODY)--------->|
    |                              |<---* FETCH 172 BODY----------|
    |<--message_response-----------|                               |
    |  {message: {...}}            |                               |
    |                              |                               |
    |---disconnect--------------->|                               |
    |                              |----LOGOUT------------------->|
    |                              |<---OK------------------------|
    |                              | (process exits)               |
```

---

## 7. Native Messaging Manifest

### 7.1 Manifest File Locations

**macOS:**
```
/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json
```

**Windows (Registry):**
```
HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge
→ Default: "C:\Program Files\InboxKey\com.inboxkey.bridge.json"
```

**Linux:**
```
/etc/opt/chrome/native-messaging-hosts/com.inboxkey.bridge.json
```

### 7.2 Manifest Content

```json
{
  "name": "com.inboxkey.bridge",
  "description": "InboxBridge - Local IMAP helper for InboxKey",
  "path": "/usr/local/bin/inboxbridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://abcdefghijklmnopqrstuvwxyz123456/"
  ]
}
```

**Fields:**
- `name`: Unique identifier for the native host
- `description`: Human-readable description
- `path`: Absolute path to the native executable
- `type`: Always `"stdio"` (communicates via stdin/stdout)
- `allowed_origins`: Array of extension IDs that can connect (exact match, no wildcards)

### 7.3 Multi-Browser Support

**Edge, Brave, Opera** (all Chromium-based):
- Use same executable
- Create additional manifests in browser-specific directories:
  - Edge: `/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`
  - Brave: `/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`

**Installer Strategy:**
- Create symlinks from browser-specific manifest paths to main manifest
- Installer detects installed browsers and creates appropriate symlinks

---

## 8. Installation & Packaging

### 8.1 macOS (.pkg Installer)

**File Locations:**
- Binary: `/usr/local/bin/inboxbridge`
- Manifest: `/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json`

**Installer Script (embedded in .pkg):**
```bash
#!/bin/bash

# Copy binary
install -m 0755 inboxbridge /usr/local/bin/inboxbridge

# Create manifest directory
mkdir -p "/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Copy manifest
install -m 0644 com.inboxkey.bridge.json "/Library/Application Support/Google/Chrome/NativeMessagingHosts/"

# Create Edge/Brave symlinks if browsers are installed
if [ -d "/Applications/Microsoft Edge.app" ]; then
  mkdir -p "/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  ln -sf "/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json" \
         "/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.inboxkey.bridge.json"
fi

echo "InboxBridge installed successfully!"
```

**Build Command:**
```bash
pkgbuild --root ./pkg_root \
         --identifier com.inboxkey.bridge \
         --version 1.0.0 \
         --install-location / \
         inboxbridge-macos.pkg
```

### 8.2 Windows (.msi Installer)

**File Locations:**
- Binary: `C:\Program Files\InboxKey\inboxbridge.exe`
- Manifest: `C:\Program Files\InboxKey\com.inboxkey.bridge.json`

**Registry Entry:**
```
HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge
  Default (REG_SZ) = "C:\Program Files\InboxKey\com.inboxkey.bridge.json"
```

**WiX Toolset XML (inboxbridge.wxs):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="InboxBridge" Version="1.0.0" Manufacturer="InboxKey">
    <Package InstallerVersion="200" Compressed="yes" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="InboxKey">
          <Component Id="InboxBridge" Guid="*">
            <File Id="inboxbridge.exe" Source="target\release\inboxbridge.exe" KeyPath="yes" />
            <File Id="manifest.json" Source="com.inboxkey.bridge.json" />
          </Component>
        </Directory>
      </Directory>
    </Directory>

    <Feature Id="InboxBridgeFeature" Title="InboxBridge" Level="1">
      <ComponentRef Id="InboxBridge" />
      <ComponentRef Id="RegistryEntry" />
    </Feature>

    <Component Id="RegistryEntry" Directory="INSTALLFOLDER" Guid="*">
      <RegistryKey Root="HKLM" Key="SOFTWARE\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge">
        <RegistryValue Type="string" Value="[INSTALLFOLDER]com.inboxkey.bridge.json" />
      </RegistryKey>
    </Component>
  </Product>
</Wix>
```

**Build Command:**
```bash
candle inboxbridge.wxs
light -out inboxbridge-windows.msi inboxbridge.wixobj
```

### 8.3 Linux (.deb / .rpm Packages)

**File Locations:**
- Binary: `/usr/bin/inboxbridge`
- Manifest: `/etc/opt/chrome/native-messaging-hosts/com.inboxkey.bridge.json`

**Debian Control File (DEBIAN/control):**
```
Package: inboxbridge
Version: 1.0.0
Architecture: amd64
Maintainer: InboxKey <support@inboxkey.com>
Description: InboxBridge - Local IMAP helper for InboxKey
Depends: libsecret-1-0
```

**Post-Install Script (DEBIAN/postinst):**
```bash
#!/bin/bash
chmod 0755 /usr/bin/inboxbridge
mkdir -p /etc/opt/chrome/native-messaging-hosts
chmod 0644 /etc/opt/chrome/native-messaging-hosts/com.inboxkey.bridge.json
```

**Build Command:**
```bash
dpkg-deb --build inboxbridge_1.0.0_amd64
```

---

## 9. Error Handling & Recovery

### 9.1 Error Categories

**Connection Errors:**
- `NETWORK_ERROR`: DNS failure, connection timeout, server unreachable
- `TLS_ERROR`: Certificate validation failed, TLS handshake failed
- `AUTH_FAILED`: Invalid credentials, account locked, two-factor required

**Protocol Errors:**
- `IMAP_ERROR`: Server returned error response (e.g., `NO` or `BAD`)
- `PARSE_ERROR`: Invalid IMAP response format
- `TIMEOUT`: Operation exceeded timeout (30 seconds default)

**Request Errors:**
- `INVALID_REQUEST`: Malformed JSON, missing required fields
- `NOT_CONNECTED`: Extension sent request before calling `connect`

### 9.2 Recovery Strategy

**Connection Failures:**
```rust
async fn connect_with_retry(config: &ImapConfig) -> Result<ImapClient> {
    let mut retries = 3;
    let mut delay = Duration::from_secs(1);

    loop {
        match connect_imap(&config.server, config.port, &config.email, &config.password).await {
            Ok(client) => return Ok(client),
            Err(e) if retries > 0 => {
                eprintln!("Connection failed: {}. Retrying in {:?}...", e, delay);
                sleep(delay).await;
                retries -= 1;
                delay *= 2;  // Exponential backoff
            },
            Err(e) => return Err(e),
        }
    }
}
```

**Auth Failures:**
- Do NOT retry automatically (avoids account lockouts)
- Return `AUTH_FAILED` error to extension
- Extension prompts user to re-enter credentials

**Graceful Degradation:**
- If IMAP connection fails, extension continues working with Gmail/Outlook
- Native app crash should not crash the extension
- Extension detects native app unavailable and shows "InboxBridge not installed" message

---

## 10. Testing Strategy

### 10.1 Unit Tests

**Rust Test Framework:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_protocol_parsing() {
        let request = r#"{"type": "connect", "server": "imap.gmail.com", "port": 993}"#;
        let parsed: ConnectRequest = serde_json::from_str(request).unwrap();
        assert_eq!(parsed.server, "imap.gmail.com");
        assert_eq!(parsed.port, 993);
    }

    #[tokio::test]
    async fn test_keychain_storage() {
        store_imap_password("test@example.com", "password123").unwrap();
        let password = get_imap_password("test@example.com").unwrap();
        assert_eq!(password, "password123");
    }
}
```

### 10.2 Integration Tests (Mock IMAP Server)

**Use `greenmail` or custom mock server:**
```rust
#[tokio::test]
async fn test_full_flow() {
    // Start mock IMAP server on localhost:9993
    let mock_server = MockImapServer::start(9993).await;

    // Connect
    let mut client = connect_imap("localhost", 9993, "test@example.com", "password").await.unwrap();

    // Search recent
    let ids = search_recent(&mut client, 10).await.unwrap();
    assert_eq!(ids.len(), 3);

    // Fetch message
    let msg = fetch_message(&mut client, ids[0]).await.unwrap();
    assert_eq!(msg.subject, "Your verification code");

    mock_server.shutdown().await;
}
```

### 10.3 End-to-End Tests (Real IMAP Accounts)

**Test Accounts:**
- Gmail test account with App Password
- Yahoo test account
- ProtonMail test account (uses Bridge, slightly different protocol)

**Test Scenarios:**
1. Connect to Gmail → fetch recent messages → verify contents
2. Handle connection timeout (unplug network)
3. Handle auth failure (wrong password)
4. Handle IMAP server error (mailbox doesn't exist)

---

## 11. User Experience Flow

### 11.1 First-Time Setup (User's Perspective)

1. **Download InboxBridge**
   - User navigates to InboxKey Settings → "Add IMAP Account"
   - Extension shows download page with OS detection
   - User clicks "Download InboxBridge for macOS" (or Windows/Linux)
   - Downloads `inboxbridge-macos.pkg` (15MB)

2. **Install InboxBridge**
   - User double-clicks `.pkg` installer
   - macOS shows installation wizard
   - Clicks "Continue" → "Install" → enters admin password
   - Installer completes: "InboxBridge has been installed successfully!"

3. **Verify Installation**
   - User returns to extension
   - Clicks "Test Connection" button
   - Extension calls `chrome.runtime.connectNative('com.inboxkey.bridge')`
   - **Success:** Green checkmark + "InboxBridge connected!"
   - **Failure:** Red X + "InboxBridge not detected. [Troubleshooting]"

4. **Configure IMAP Account**
   - Extension shows form:
     - IMAP Server: `imap.gmail.com` (or Yahoo, ProtonMail, etc.)
     - Port: `993` (default)
     - Email: `user@gmail.com`
     - App Password: `abcd efgh ijkl mnop` (tooltip: "Generate app password in Gmail settings")
   - User fills in details, clicks "Connect"

5. **Store Credentials**
   - Extension sends `connect` request to InboxBridge
   - InboxBridge stores password in macOS Keychain
   - InboxBridge connects to IMAP server, sends `LOGIN` command
   - **Success:** "Connected to Gmail via IMAP ✓"
   - **Failure:** "Authentication failed. Check your app password. [Retry]"

6. **First Code Fetch**
   - User navigates to site requiring verification code
   - Extension detects field, sends `listRecent(10)` to InboxBridge
   - InboxBridge fetches recent messages, returns to extension
   - Extension extracts code, autofills field
   - User sees: "Code filled ✓"

### 11.2 Ongoing Usage

- Extension sends `listRecent` requests as needed (when code field detected)
- InboxBridge maintains IMAP connection for 5 minutes
- After 5 minutes idle, connection closes (sends `LOGOUT`)
- Next request automatically reconnects (using stored credentials)

### 11.3 Uninstallation

**macOS:**
1. User runs `/Applications/InboxKey/Uninstall InboxBridge.app`
2. Uninstaller removes:
   - `/usr/local/bin/inboxbridge` (binary)
   - `/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json` (manifest)
   - Keychain entries (all stored credentials)
3. Extension detects native app unavailable, shows message: "InboxBridge removed. Gmail and Outlook still work."

**Windows:**
1. User goes to "Add or Remove Programs"
2. Selects "InboxBridge" → "Uninstall"
3. Uninstaller removes binary, manifest, registry keys, and credentials

**Linux:**
```bash
sudo apt remove inboxbridge  # Debian/Ubuntu
sudo yum remove inboxbridge  # RedHat/CentOS
```

---

## 12. Future Enhancements (Post-MVP)

### 12.1 IMAP IDLE Support

**What:** Real-time push notifications when new messages arrive.

**How:**
```
C: a006 IDLE
S: + idling
S: * 173 EXISTS
C: DONE
S: a006 OK IDLE terminated
```

**Benefits:**
- No polling needed (reduces server load)
- Instant code delivery (<1 second vs 5-second poll interval)
- Lower battery usage (no timer ticking every 5 seconds)

**Implementation:**
- Run IDLE command in background thread
- Send `* EXISTS` notifications to extension via async message
- Extension wakes up, fetches new message immediately

### 12.2 Multi-Account Support

**What:** Connect multiple IMAP accounts simultaneously.

**How:**
- InboxBridge maintains a pool of IMAP connections (one per account)
- Extension sends `accountId` parameter with each request
- Native app routes request to correct connection

**UI:**
- Settings page shows list of connected IMAP accounts
- "Add Another IMAP Account" button
- Each account can be individually disconnected

### 12.3 OAuth 2.0 for IMAP

**What:** Use OAuth tokens instead of app passwords for Gmail/Outlook IMAP.

**Why:**
- More secure (tokens can be revoked, passwords cannot)
- Better UX (no need to generate app password)
- Consistent with Gmail/Outlook OAuth flow in extension

**How:**
- Extension handles OAuth flow (already implemented for API)
- Sends access token to InboxBridge instead of password
- InboxBridge uses `AUTHENTICATE XOAUTH2` command instead of `LOGIN`

---

## 13. Security Audit Checklist

Before public release, InboxBridge must pass this security audit:

- [ ] **Credential Storage:** All passwords stored in OS keychain, never in plaintext
- [ ] **Extension ID Validation:** Only accepts connections from whitelisted extension ID
- [ ] **Network Isolation:** No listening sockets, outbound connections only
- [ ] **TLS Validation:** Certificate validation enabled, no insecure connections
- [ ] **Input Validation:** All JSON requests validated, reject malformed data
- [ ] **Error Messages:** No credential leaks in error messages or logs
- [ ] **Memory Safety:** No buffer overflows, use-after-free, data races (Rust guarantees)
- [ ] **Uninstall Cleanup:** Credentials removed from keychain on uninstall
- [ ] **Code Signing:** Binaries signed with valid certificate (macOS/Windows)
- [ ] **Dependency Audit:** All Rust crates audited for known vulnerabilities (`cargo audit`)

---

## 14. Documentation Requirements

### 14.1 User-Facing Docs

**Installation Guide** (`docs/inboxbridge/INSTALL.md`):
- Step-by-step screenshots for each OS
- Troubleshooting section:
  - "InboxBridge not detected" → Verify manifest path, check Chrome logs
  - "Authentication failed" → Verify app password, enable IMAP in server settings
  - "Connection timeout" → Check firewall, verify server address

**IMAP Server Configuration** (`docs/inboxbridge/SERVERS.md`):
- Popular providers (Gmail, Yahoo, ProtonMail, Fastmail, iCloud)
- Server addresses and ports
- How to generate app passwords
- Links to provider documentation

**FAQ** (`docs/inboxbridge/FAQ.md`):
- "Is InboxBridge safe?" → Yes, open-source, runs locally, uses OS keychain
- "Can it see my emails?" → Only messages from last 10 minutes, not full mailbox
- "How do I uninstall?" → Instructions for each OS

### 14.2 Developer Docs

**Building from Source** (`BUILDING.md`):
```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone repository
git clone https://github.com/inboxkey/inboxbridge
cd inboxbridge

# Build for current platform
cargo build --release

# Binary located at: target/release/inboxbridge
```

**Protocol Specification** (`PROTOCOL.md`):
- Full JSON schema for all message types
- Example request/response pairs
- Error codes and meanings

**Contributing Guide** (`CONTRIBUTING.md`):
- Code style (rustfmt)
- Pull request process
- How to run tests

---

## 15. Deployment Strategy

### 15.1 Beta Testing

**Phase 1: Internal Testing (2 weeks)**
- 5-10 developers test on all 3 platforms
- Focus on installation experience and edge cases
- Collect feedback via private Slack channel

**Phase 2: Public Beta (4 weeks)**
- Unlisted Chrome Web Store extension with InboxBridge support
- 50-100 beta users (invite via email)
- GitHub Issues for bug reports
- Weekly feedback surveys

### 15.2 Gradual Rollout

**Week 1:** macOS only (easiest packaging, most common among early adopters)
**Week 2:** Windows support added
**Week 3:** Linux support added (.deb for Ubuntu/Debian)
**Week 4:** All platforms stable, announce publicly

### 15.3 Support Plan

**Support Channels:**
- **GitHub Issues:** Bug reports and feature requests
- **Discord/Slack:** Real-time user support
- **Email:** security@inboxkey.com for security issues

**Response SLAs:**
- Security issues: <24 hours
- Installation problems: <48 hours
- Feature requests: Best-effort

---

## 16. Success Metrics

**Adoption Targets (6 months post-launch):**
- ≥1,000 InboxBridge installations
- ≥80% successful first-time setup rate
- <5% uninstall rate due to installation issues

**Quality Metrics:**
- <1% crash rate (native app terminations)
- ≥95% IMAP connection success rate
- <2 seconds average fetch latency (listRecent + getMessage)

**Security Metrics:**
- 0 credential leaks reported
- 0 critical security vulnerabilities in dependencies
- 100% code signing compliance (macOS/Windows)

---

## 17. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Installation complexity deters users | HIGH | HIGH | Excellent docs, video tutorials, 1-click installers |
| Antivirus false positives | MEDIUM | HIGH | Code signing, VirusTotal submission, whitelist requests |
| IMAP server compatibility issues | MEDIUM | MEDIUM | Extensive testing across providers, fallback error messages |
| OS keychain API changes | LOW | LOW | Monitor OS release notes, test on beta OS versions |
| Native Messaging API deprecation | LOW | VERY LOW | Chrome committed to Native Messaging, no plans to remove |

---

## 18. Open Questions

1. **Should we support POP3 in addition to IMAP?**
   - Pros: Wider server compatibility
   - Cons: POP3 doesn't support searching, would need to download all messages

2. **Should InboxBridge auto-update?**
   - Pros: Users always have latest version
   - Cons: Complex implementation, requires update server

3. **Should we implement IMAP connection sharing across browser profiles?**
   - Pros: Only one IMAP connection for multiple browser profiles
   - Cons: Complex IPC, potential security issues

---

## Appendix A: Code Structure

```
/inboxbridge
  /src
    main.rs               # Entry point, Native Messaging loop
    imap.rs               # IMAP client wrapper (async-imap)
    keychain.rs           # OS keychain integration (keyring)
    protocol.rs           # JSON message parsing (serde)
    errors.rs             # Error types
    config.rs             # Configuration management
  /tests
    integration_tests.rs  # E2E tests with mock IMAP server
    unit_tests.rs         # Unit tests for protocol, keychain
  Cargo.toml              # Dependencies
  README.md               # User-facing documentation
  BUILDING.md             # Developer build instructions
  LICENSE                # MIT or Apache-2.0
```

---

## Appendix B: Rust Dependencies (Cargo.toml)

```toml
[package]
name = "inboxbridge"
version = "1.0.0"
edition = "2021"

[dependencies]
async-imap = "0.9"           # IMAP client
async-native-tls = "0.5"     # TLS for IMAP
tokio = { version = "1", features = ["full"] }  # Async runtime
serde = { version = "1", features = ["derive"] } # JSON serialization
serde_json = "1"             # JSON parsing
keyring = "2"                # OS keychain access
anyhow = "1"                 # Error handling
chrono = "0.4"               # Date/time parsing

[dev-dependencies]
mockito = "1"                # HTTP mocking (for tests)
tokio-test = "0.4"           # Async test utilities
```

---

## Appendix C: Extension Integration Requirements

### Background Script Message Handler

The extension's background script must handle IMAP account storage:

**File:** `/extension/src/background/index.ts` (or runtime message handler)

```typescript
case 'STORE_IMAP_MAILBOX': {
  const { accountId, email, server, port } = message

  // Create mailbox record
  const mailbox: Mailbox = {
    id: generateId(),
    providerId: 'imap-bridge',
    email,
    imapAccountId: accountId,
    imapServer: server,
    imapPort: port,
    addedAt: Date.now(),
    lastSyncedAt: 0,
  }

  // Store in chrome.storage.local
  await storeMailbox(mailbox)

  return { success: true, mailboxId: mailbox.id }
}
```

### IMAP Email Polling Integration

**File:** `/extension/src/background/email-polling-service.ts` (or similar)

```typescript
import { IMAPBridgeProvider } from '@/lib/providers/imap-bridge/imap-bridge-provider'

// In polling loop:
if (mailbox.providerId === 'imap-bridge') {
  const provider = new IMAPBridgeProvider()
  const emails = await provider.fetchEmails(
    mailbox.imapAccountId!,
    { newerThan: new Date(Date.now() - 10 * 60 * 1000), maxResults: 15 }
  )
  // Process emails...
}
```

### GitHub Releases Structure

**Release assets required:**

```
Release v1.0.0 - InboxBridge IMAP Support
├─ inboxbridge-macos-x64
├─ inboxbridge-macos-arm64
├─ inboxbridge-windows-x64.exe
├─ inboxbridge-linux-x64
├─ com.inboxkey.bridge.json (macOS manifest)
├─ com.inboxkey.bridge.json (Linux manifest)
├─ com.inboxkey.bridge.reg (Windows registry)
└─ INSTALL.md (installation guide)
```

---

**End of Specification**

**Status:** Ready for Implementation (Post-MVP)
**Next Step:** Create GitHub repository `inboxkey/inboxbridge`, set up CI/CD, begin Rust development
**Owner:** InboxKey Core Team
**Last Updated:** 2025-10-25
