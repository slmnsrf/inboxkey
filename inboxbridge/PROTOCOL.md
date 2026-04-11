# InboxBridge Native Messaging Protocol v1

**Version:** 1.0.0
**Transport:** Chrome Native Messaging (4-byte length-prefixed JSON over stdin/stdout)
**Encoding:** UTF-8

---

## 1. Framing

All messages use Chrome Native Messaging framing:
- **4-byte length prefix** (little-endian uint32)
- **JSON payload** (UTF-8 encoded)

Example:
```
[0x0E, 0x00, 0x00, 0x00] {"v":1,"id":"..."}
```

---

## 2. Message Envelope

### Request (Extension → Native App)

```json
{
  "v": 1,
  "id": "uuid-1234",
  "method": "account.add",
  "params": {
    "label": "Yahoo",
    "host": "imap.mail.yahoo.com",
    "port": 993,
    "tls": true,
    "username": "alice@yahoo.com",
    "password": "app-password"
  }
}
```

**Fields:**
- `v` (number, required): Protocol version (always `1` for v1)
- `id` (string, required): Request ID (UUID) for correlation
- `method` (string, required): Method name (see Methods section)
- `params` (object, optional): Method parameters

### Response (Native App → Extension)

**Success:**
```json
{
  "v": 1,
  "id": "uuid-1234",
  "result": {
    "accountId": "acc_123"
  }
}
```

**Error:**
```json
{
  "v": 1,
  "id": "uuid-1234",
  "error": {
    "code": "IMAP_AUTH",
    "message": "Invalid credentials",
    "details": {
      "server": "imap.mail.yahoo.com"
    }
  }
}
```

**Fields:**
- `v` (number, required): Protocol version
- `id` (string, required): Matches request ID
- `result` (object, optional): Response data (success)
- `error` (object, optional): Error details (failure)

### Event (Native App → Extension, async)

```json
{
  "v": 1,
  "event": "bridge.mailUpdate",
  "data": {
    "accountId": "acc_123",
    "mailbox": "INBOX",
    "uid": 52123,
    "date": "2025-10-20T15:30:00Z",
    "from": "noreply@service.com",
    "subject": "Your verification code",
    "snippet": "Your code is 123456"
  }
}
```

**Fields:**
- `v` (number, required): Protocol version
- `event` (string, required): Event name
- `data` (object, required): Event payload

---

## 3. Methods

### 3.1 `bridge.ping`

Healthcheck and connection validation.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-1",
  "method": "bridge.ping",
  "params": {}
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-1",
  "result": {
    "ok": true,
    "version": "1.1.0-rc1",
    "protocolVersion": 1,
    "minProtocolVersion": 1,
    "features": {
      "idle": false,
      "tls13": true
    },
    "installInfo": {
      "executablePath": "C:\\Users\\alice\\AppData\\Local\\InboxBridge\\inboxbridge.exe",
      "kind": "directory",
      "uninstallTarget": "C:\\Users\\alice\\AppData\\Local\\InboxBridge"
    }
  }
}
```

**Fields:**
- `ok`: Always `true` if ping succeeds
- `version`: InboxBridge semantic version (e.g., "1.0.0")
- `protocolVersion`: Current protocol version supported by this native app
- `minProtocolVersion`: Minimum protocol version required by this native app
- `features`: Optional capability flags
- `installInfo` *(optional, added in 1.1.0)*: Where the bridge binary lives and how to uninstall it. Older bridge versions omit this field; clients MUST treat it as optional and fall back to static per-OS copy when absent.

**`installInfo` sub-fields:**
- `executablePath`: Absolute canonicalized path of the running executable.
- `kind`: One of `"single-binary"`, `"directory"`, `"app-bundle"`. Drives the UI verb in the uninstall modal ("delete this file" vs "delete this folder" vs "drag to Trash").
- `uninstallTarget`: The exact file or directory the user should remove to complete the uninstall. For `single-binary` this equals `executablePath`. For `directory` this is the parent directory of the executable. For `app-bundle` this is the enclosing `.app` bundle.

**Detection rules** (evaluated in order, first match wins):
1. If any ancestor path segment of the executable ends in `.app`, treat as `app-bundle` and return the `.app` directory as `uninstallTarget`.
2. If the executable's parent directory contains a file named `com.inboxkey.bridge.json` (co-located Chrome native messaging manifest), treat as `directory` and return the parent directory as `uninstallTarget`. This matches both the Windows Inno Setup installer and the Windows portable `install.ps1` layouts.
3. Otherwise, treat as `single-binary` and return the executable file path as `uninstallTarget`. This matches the macOS pkg installer (`/usr/local/bin/inboxbridge` with manifest under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`) and any portable single-file drop.

Detection runs on every `bridge.ping`; there is no cache. The cost is one `current_exe` + canonicalize + up to one `Path::exists` check.

### 3.2 `installStatus.get`

Check if InboxBridge is installed and operational.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-2",
  "method": "installStatus.get"
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-2",
  "result": {
    "installed": true,
    "version": "1.0.0",
    "keychain": "macos"
  }
}
```

**Fields:**
- `keychain`: `"macos"` | `"windows"` | `"secret-service"` | `"unavailable"`

### 3.3 `account.add`

Add IMAP account and store credentials in OS keychain.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-3",
  "method": "account.add",
  "params": {
    "label": "Yahoo Mail",
    "host": "imap.mail.yahoo.com",
    "port": 993,
    "tls": true,
    "username": "alice@yahoo.com",
    "password": "app-password"
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-3",
  "result": {
    "accountId": "acc_abc123"
  }
}
```

**Error Example:**
```json
{
  "v": 1,
  "id": "uuid-3",
  "error": {
    "code": "KEYCHAIN_UNAVAILABLE",
    "message": "Cannot access OS keychain"
  }
}
```

### 3.4 `account.remove`

Remove account and delete credentials from keychain.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-4",
  "method": "account.remove",
  "params": {
    "accountId": "acc_abc123"
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-4",
  "result": {
    "success": true
  }
}
```

### 3.5 `account.test`

Test IMAP connection without saving account.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-5",
  "method": "account.test",
  "params": {
    "host": "imap.mail.yahoo.com",
    "port": 993,
    "tls": true,
    "username": "alice@yahoo.com",
    "password": "app-password"
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-5",
  "result": {
    "success": true,
    "capabilities": {
      "idle": true
    },
    "roundTripMs": 145
  }
}
```

### 3.6 `watch.start`

Start watching for new messages (live connection with polling).

**Request:**
```json
{
  "v": 1,
  "id": "uuid-6",
  "method": "watch.start",
  "params": {
    "accountId": "acc_abc123",
    "filters": {
      "newerThan": "10m",
      "unseen": true,
      "from": null,
      "subject": null
    }
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-6",
  "result": {
    "watchId": "watch_xyz789"
  }
}
```

**Events Emitted:**
The native app will emit `bridge.mailUpdate` events asynchronously as new messages arrive.

### 3.7 `watch.stop`

Stop watching for messages.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-7",
  "method": "watch.stop",
  "params": {
    "watchId": "watch_xyz789"
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-7",
  "result": {
    "success": true
  }
}
```

### 3.8 `mail.fetchRecent`

Fetch recent messages (one-time query, no live connection).

**Request:**
```json
{
  "v": 1,
  "id": "uuid-8",
  "method": "mail.fetchRecent",
  "params": {
    "accountId": "acc_abc123",
    "sinceMinutes": 10,
    "limit": 15
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-8",
  "result": {
    "messages": [
      {
        "uid": 52123,
        "date": "2025-10-20T15:30:00Z",
        "from": "noreply@service.com",
        "subject": "Your verification code",
        "snippet": "Your code is 123456"
      }
    ]
  }
}
```

### 3.9 `credentials.update`

Update password for existing account.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-9",
  "method": "credentials.update",
  "params": {
    "accountId": "acc_abc123",
    "password": "new-app-password"
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-9",
  "result": {
    "success": true
  }
}
```

### 3.10 `diagnostics.get`

Get recent errors and connection stats (debugging).

**Request:**
```json
{
  "v": 1,
  "id": "uuid-10",
  "method": "diagnostics.get"
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-10",
  "result": {
    "errors": [
      {
        "timestamp": "2025-10-20T15:29:00Z",
        "code": "IMAP_NETWORK",
        "message": "Connection timeout",
        "accountId": "acc_abc123"
      }
    ],
    "connections": {
      "active": 2,
      "idle": 1
    }
  }
}
```

### 3.11 `log.setLevel`

Set logging level (temporary, for debugging).

**Request:**
```json
{
  "v": 1,
  "id": "uuid-11",
  "method": "log.setLevel",
  "params": {
    "level": "debug",
    "durationSeconds": 300
  }
}
```

**Response:**
```json
{
  "v": 1,
  "id": "uuid-11",
  "result": {
    "success": true,
    "expiresAt": "2025-10-20T15:35:00Z"
  }
}
```

**Levels:** `"error"` | `"warn"` (default) | `"info"` | `"debug"`

### 3.12 `bridge.uninstall`

*Added in 1.1.0.*

Atomic cleanup of all bridge-side state. Used by the extension's uninstall modal to remove keychain entries, `accounts.json`, and the lock file in one call.

The bridge process does **not** self-terminate on success; it stays alive until the extension disconnects normally. This lets the extension also drive its own storage cleanup afterwards without racing a dying bridge.

**Request:**
```json
{
  "v": 1,
  "id": "uuid-12",
  "method": "bridge.uninstall",
  "params": {}
}
```

**Response (success or partial keychain failure):**
```json
{
  "v": 1,
  "id": "uuid-12",
  "result": {
    "keychainEntriesRemoved": 2,
    "keychainEntriesFailed": [
      {
        "accountId": "acc_abc123",
        "service": "InboxBridge:acc_abc123",
        "reason": "keyring access denied"
      }
    ],
    "accountsFileDeleted": true
  }
}
```

**Fields:**
- `keychainEntriesRemoved`: Count of successfully removed keychain entries.
- `keychainEntriesFailed`: Per-entry diagnostics for any keychain deletions that failed. Individual failures are not fatal; they are reported so the extension can surface a warning.
- `accountsFileDeleted`: `true` if `accounts.json` was removed or never existed.

**Error responses:**

`CLEANUP_SNAPSHOT_FAILED` is returned when the bridge cannot read the account list at all. **Nothing was attempted**, state is unchanged. The extension should fall back to the legacy per-account `account.remove` loop.

```json
{
  "v": 1,
  "id": "uuid-12",
  "error": {
    "code": "CLEANUP_SNAPSHOT_FAILED",
    "message": "Could not read account list before cleanup: ..."
  }
}
```

`CLEANUP_STATE_DELETE_FAILED` is returned when keychain cleanup completed but `accounts.json` could not be removed. **Credentials are gone**, but bridge state files linger. The extension should surface this as an info line, not a blocker.

```json
{
  "v": 1,
  "id": "uuid-12",
  "error": {
    "code": "CLEANUP_STATE_DELETE_FAILED",
    "message": "Keychain cleanup completed but accounts.json could not be deleted: ..."
  }
}
```

**Ordering guarantee:**

1. Account list snapshotted from `accounts.json`.
2. Each keychain entry deleted in turn; failures recorded per-entry.
3. `accounts.json` deleted under an exclusive lock.
4. `accounts.lock` removed best-effort (never surfaced as an error).

Step 1 is a hard precondition: without a snapshot the bridge cannot construct the keychain keys to delete, so a snapshot failure aborts the call before any mutation. Steps 2–4 proceed in order and the lock-file removal is never user-visible.

**Compatibility:**

The same cleanup routine is exposed via the `--cleanup` CLI flag for installer uninstall scripts. Both entry points share `cleanup::run_full_cleanup` in the Rust implementation; the extension RPC is preferred when a live bridge connection exists because the user can see the structured result in-UI.

Old bridges predating 1.1.0 respond with `METHOD_NOT_FOUND`. Extensions MUST handle that error code and fall back to the legacy per-account `account.remove` loop.

---

## 4. Events

### 4.1 `bridge.mailUpdate`

Emitted when new message arrives during active watch.

**Event:**
```json
{
  "v": 1,
  "event": "bridge.mailUpdate",
  "data": {
    "accountId": "acc_abc123",
    "mailbox": "INBOX",
    "uid": 52123,
    "date": "2025-10-20T15:30:00Z",
    "from": "noreply@service.com",
    "subject": "Your verification code",
    "snippet": "Your code is 123456"
  }
}
```

**Fields:**
- `uid`: IMAP UID (unique within mailbox)
- `snippet`: First ~200 chars of plain text body

### 4.2 `bridge.connectionLost`

Emitted when IMAP connection drops during watch.

**Event:**
```json
{
  "v": 1,
  "event": "bridge.connectionLost",
  "data": {
    "accountId": "acc_abc123",
    "reason": "Network timeout",
    "willRetry": true,
    "retryAfterSeconds": 30
  }
}
```

### 4.3 `bridge.connectionRestored`

Emitted when connection is re-established after loss.

**Event:**
```json
{
  "v": 1,
  "event": "bridge.connectionRestored",
  "data": {
    "accountId": "acc_abc123"
  }
}
```

---

## 5. Error Codes

| Code | Meaning | Retry? |
|------|---------|--------|
| `INVALID_JSON` | Malformed JSON in request | No |
| `METHOD_NOT_FOUND` | Unknown method name | No |
| `INVALID_PARAMS` | Missing or invalid parameters | No |
| `IMAP_AUTH` | Authentication failed (bad credentials) | No |
| `IMAP_NETWORK` | Network error (timeout, DNS failure) | Yes |
| `IMAP_CAPABILITY` | Server doesn't support required capability | No |
| `KEYCHAIN_UNAVAILABLE` | Cannot access OS keychain | No |
| `TLS_HANDSHAKE` | TLS connection failed | Yes |
| `ACCOUNT_NOT_FOUND` | Account ID doesn't exist | No |
| `WATCH_NOT_FOUND` | Watch ID doesn't exist | No |
| `RATE_LIMIT_EXCEEDED` | Too many concurrent requests | Yes (backoff) |
| `MESSAGE_TOO_LARGE` | Message exceeds 10MB limit | No |
| `WATCH_EXPIRED` | Watch session exceeded 15min | No (restart watch) |
| `CONNECTION_LIMIT` | Max 5 accounts connected | No |
| `CLEANUP_SNAPSHOT_FAILED` | `bridge.uninstall` could not read accounts.json; nothing was attempted | No |
| `CLEANUP_STATE_DELETE_FAILED` | `bridge.uninstall` cleaned the keychain but could not delete accounts.json | No |
| `UNEXPECTED` | Internal error (bug) | No |

---

## 6. Connection Lifecycle

### Singleton Port Pattern

The extension background worker maintains a **single Native Messaging port** for all IMAP operations:

1. **Connect:** `chrome.runtime.connectNative('com.inboxkey.bridge')`
2. **Handshake:** Send `bridge.ping` to verify connection
3. **Operations:** Send requests, receive responses + events
4. **Reconnect:** If port disconnects (MV3 eviction), reconnect and re-send `bridge.ping`

### MV3 Service Worker Restart Handling

**Problem:** MV3 service workers can be evicted mid-session, killing the port.

**Solution:**

1. **Extension** detects port disconnect via `port.onDisconnect` listener
2. **Extension** reconnects via `connectNative()` (no-op if worker wasn't evicted)
3. **Extension** sends `bridge.ping` to verify native app still alive
4. **Native app** maintains IMAP connections independently (doesn't rely on port staying open)
5. **Extension** resumes operations seamlessly

**Ping/Pong Sequence:**

```
Extension → Native: {"v":1,"id":"ping-1","method":"bridge.ping"}
Native → Extension:  {"v":1,"id":"ping-1","result":{"ok":true,"version":"1.0.0","protocolVersion":1,"minProtocolVersion":1}}
```

### 6.3 Ping Timeout Handling

**Scenario:** Extension sends `bridge.ping`, no response within 5 seconds.

#### Recovery Steps

1. **Retry 1:** Wait 5s → Retry ping (same request ID reused)
2. **Retry 2:** Wait 5s → Retry ping with new request ID
3. **Fail:** After 2 failed pings (total 15s elapsed), mark bridge as unavailable

#### Extension State Transitions

| Time Elapsed | Status | User-Facing Message |
|--------------|--------|---------------------|
| 0-5s | Connecting | "Connecting to InboxBridge..." (spinner) |
| 5-10s | Retry 1 | "InboxBridge slow to respond, retrying..." (warning icon) |
| 10-15s | Retry 2 | "InboxBridge not responding, checking installation..." (spinner) |
| 15s+ | Failed | "InboxBridge unavailable. [Troubleshoot] [Reinstall]" (error) |

#### Error Code Mapping

| Error Scenario | Code | User Message | Recovery Action |
|----------------|------|--------------|-----------------|
| No response to ping | `BRIDGE_TIMEOUT` | "InboxBridge is not responding. Check if running." | [Troubleshoot] button |
| chrome.runtime.connectNative() fails | `BRIDGE_NOT_INSTALLED` | "InboxBridge is not installed." | [Install Now] button |
| Native app exits during session | `BRIDGE_CRASHED` | "InboxBridge stopped unexpectedly." | [Restart] [View Logs] |
| Protocol version mismatch | `BRIDGE_VERSION_MISMATCH` | "InboxBridge needs to be updated." | [Update] button |

#### Implementation Example

```typescript
async function connectWithRetry(): Promise<Port> {
  const port = chrome.runtime.connectNative('com.inboxkey.bridge');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await sendWithTimeout(port, { method: 'bridge.ping' }, 5000);
      return port; // Success
    } catch (error) {
      if (attempt === 2) {
        throw new BridgeTimeoutError('InboxBridge not responding after 15s');
      }
      // Wait before retry
      await sleep(5000);
    }
  }
}
```

---

## 7. Security

### 7.1 Credential Storage

- **Passwords stored:** OS keychain only (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Passwords transmitted:** Only during `account.add` and `account.test` (one-time)
- **Passwords in logs:** Never (redacted)

### 7.2 Extension Authentication

- Native Messaging manifest whitelists exact extension ID
- Chrome enforces `allowed_origins` (no wildcards)
- Only InboxKey extension can connect

### 7.3 TLS Validation

- Enforced TLS 1.2+ with `rustls`
- Certificate validation via `webpki-roots` (Mozilla CA bundle)
- No self-signed certs accepted (v1)
- No insecure fallback

### 7.4 Log Redaction

**Default log level:** `warn` (no message content)

**Redacted fields:**
- Full message bodies
- Email addresses (replaced with `user@***`)
- Passwords (never logged)

**Debug mode:** Can be enabled temporarily via `log.setLevel` (auto-expires after duration)

---

## 8. Resource Limits

- **Max concurrent connections:** 5 IMAP accounts
- **Max message fetch size:** 10 MB per message
- **Idle connection timeout:** 5 minutes (after last request)
- **Max watch duration:** 15 minutes (extension must renew)
- **Request timeout:** 30 seconds
- **Event buffer size:** 100 events (oldest dropped if full)

---

## 9. Versioning

**Protocol Version:** Specified in `v` field (currently `1`)

**Breaking Changes:**
- Require major version bump (v2, v3, etc.)
- Native app must support multiple protocol versions
- Extension negotiates version via `bridge.ping`

**Non-Breaking Changes:**
- New optional fields
- New methods (old extension ignores unknown methods)
- New error codes (old extension treats as `UNEXPECTED`)

### Version Negotiation

Extensions MUST validate protocol compatibility on first `bridge.ping`:

```typescript
const pingResponse = await nativeClient.call('bridge.ping');
if (pingResponse.protocolVersion > EXTENSION_MAX_PROTOCOL_VERSION) {
  throw new Error('InboxBridge is too new. Update your extension.');
}
if (pingResponse.protocolVersion < EXTENSION_MIN_PROTOCOL_VERSION) {
  throw new Error('InboxBridge is too old. Update InboxBridge.');
}
```

**Constants:**
- Extension v1.0: `MIN=1`, `MAX=1`
- Breaking changes require major version bump

---

## 10. Example Session

```json
// Extension → Native: Connect account
{"v":1,"id":"req-1","method":"account.add","params":{"label":"Yahoo","host":"imap.mail.yahoo.com","port":993,"tls":true,"username":"alice@yahoo.com","password":"***"}}

// Native → Extension: Account added
{"v":1,"id":"req-1","result":{"accountId":"acc_abc123"}}

// Extension → Native: Start watch
{"v":1,"id":"req-2","method":"watch.start","params":{"accountId":"acc_abc123","filters":{"newerThan":"10m","unseen":true}}}

// Native → Extension: Watch started
{"v":1,"id":"req-2","result":{"watchId":"watch_xyz789"}}

// Native → Extension: New message event (async)
{"v":1,"event":"bridge.mailUpdate","data":{"accountId":"acc_abc123","mailbox":"INBOX","uid":52123,"date":"2025-10-20T15:30:00Z","from":"noreply@github.com","subject":"Your verification code","snippet":"Your code is 123456"}}

// Extension → Native: Stop watch (after 15 seconds)
{"v":1,"id":"req-3","method":"watch.stop","params":{"watchId":"watch_xyz789"}}

// Native → Extension: Watch stopped
{"v":1,"id":"req-3","result":{"success":true}}
```

---

**End of Protocol Specification v1**
