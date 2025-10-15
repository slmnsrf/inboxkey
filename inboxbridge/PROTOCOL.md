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
    "version": "1.0.0",
    "protocolVersion": 1,
    "minProtocolVersion": 1,
    "features": {
      "idle": false,
      "tls13": true
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
