# InboxBridge Hardening Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** Fix all Critical and High findings from the dual-audit (Claude + Codex) to make InboxBridge production-ready for IMAP sync.

**Architecture:** InboxBridge is a Rust native messaging host (stdio). Chrome launches a separate process per `connectNative()` call. Accounts are currently in-memory only, which is the root cause of all sync failures. The fix strategy is: persist accounts to disk so every process sees the same state, then fix correctness bugs (TLS, UID), then clean up safety issues.

**Tech Stack:** Rust (tokio, async-imap, serde, keyring), TypeScript (Chrome Extension, Plasmo)

**Key constraint:** Each fix must be independently testable. Phases are ordered by dependency -- each phase unblocks the next.

---

## Phase 1: Account Persistence (Critical -- unblocks everything)

**Problem:** Accounts live in an in-memory HashMap (`state.rs:23-34`). Chrome launches a new native process per `connectNative()`. Options page calls `account.add` in Process A; background sync calls `mail.fetchRecent` in Process B which starts empty. IMAP sync is fundamentally broken.

**Design decisions:**
- **Storage format:** JSON file (simple, human-readable, sufficient for <20 accounts)
- **Location:** Platform-specific data directory:
  - Windows: `%APPDATA%/InboxBridge/accounts.json`
  - macOS: `~/Library/Application Support/InboxBridge/accounts.json`
  - Linux: `~/.local/share/inboxbridge/accounts.json`
- **Consistency model:** Load from disk on startup (in `AppState::new()`), save atomically after every mutation (write temp file, rename). Since Chrome creates one process per port and operations are infrequent, this is sufficient.
- **No new dependencies:** Use `serde_json` (already in Cargo.toml) + `dirs` crate for platform paths.

### Task 1.1: Add `dirs` dependency

**Files:**
- Modify: `Cargo.toml`

Add `dirs = "5"` to `[dependencies]`. This crate resolves platform-specific directories (`dirs::data_dir()` returns `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `~/.local/share` on Linux).

### Task 1.2: Add file persistence to AppState

**Files:**
- Modify: `src/state.rs`

Changes:
1. Add `#[derive(Serialize, Deserialize)]` to `Account` struct (already has `Clone, Debug`)
2. Add a `storage_path()` function that returns the JSON file path using `dirs::data_dir()`
3. Add `AppState::load()` constructor that reads `accounts.json` on startup (falls back to empty HashMap if file missing or corrupt)
4. Add `AppState::persist()` method that atomically writes all accounts to disk (write to `.tmp`, rename to `.json`)
5. Call `self.persist()` at the end of `add_account()` and `remove_account()`
6. Keep the in-memory HashMap + RwLock for fast reads within a single process lifetime

**Key code shape:**
```rust
use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account { /* existing fields */ }

impl AppState {
    /// Load persisted accounts from disk (or start fresh)
    pub fn load() -> Self {
        let path = Self::storage_path();
        let accounts = match std::fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        Self {
            accounts: Arc::new(RwLock::new(accounts)),
            watches: Arc::new(RwLock::new(HashMap::new())), // watches are ephemeral
        }
    }

    fn storage_path() -> std::path::PathBuf {
        let base = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        let dir = base.join("InboxBridge");
        std::fs::create_dir_all(&dir).ok();
        dir.join("accounts.json")
    }

    fn persist(&self, accounts: &HashMap<String, Account>) {
        let path = Self::storage_path();
        let tmp = path.with_extension("json.tmp");
        if let Ok(json) = serde_json::to_string_pretty(accounts) {
            if std::fs::write(&tmp, &json).is_ok() {
                std::fs::rename(&tmp, &path).ok();
            }
        }
    }
}
```

### Task 1.3: Use `AppState::load()` in main.rs

**Files:**
- Modify: `src/main.rs:21`

Change `AppState::new()` to `AppState::load()` so every new process loads persisted accounts.

### Task 1.4: Update existing tests

**Files:**
- Modify: `src/state.rs` (test section)

Update `test_account_lifecycle` to use `AppState::new()` (or a test-specific constructor that doesn't touch disk). Add a new test for file round-trip: create state, add account, persist, load into new state, verify account exists.

### Task 1.5: Verify end-to-end

Build InboxBridge (`cargo build --release`). Manually test:
1. Extension options page: Add IMAP account (calls `account.add`)
2. Check `accounts.json` file exists with the account data
3. Background sync: Trigger sync (calls `mail.fetchRecent`)
4. Verify "Account not found" error is gone

**Estimated LOC:** ~80 new, ~10 modified

---

## Phase 2: IMAP Correctness (High -- fetches return wrong results)

### Task 2.1: Pass TLS flag through to ImapClient

**Problem:** UI sends `tls: false` for ProtonMail Bridge (port 1143), but `account.add` hardcodes `tls: true` (`dispatcher.rs:134`), `account.test` ignores the flag (`dispatcher.rs:187`), and `ImapClient::connect()` always does immediate TLS (`imap_client.rs:29-33`).

**Files:**
- Modify: `src/dispatcher.rs` (lines 110-136, 183-237)
- Modify: `src/imap_client.rs` (lines 17-44)

Changes to `dispatcher.rs`:
1. In `handle_account_add`: Read `tls` from params instead of hardcoding `true`:
   ```rust
   let tls = params["tls"].as_bool().unwrap_or(true);
   ```
2. In `handle_account_test`: Read and pass `tls` to ImapClient:
   ```rust
   let tls = params["tls"].as_bool().unwrap_or(true);
   client.connect(host, port, username, password, tls).await
   ```
3. In `handle_mail_fetch_recent`: Pass `account.tls` to ImapClient (already stored in Account struct).

Changes to `imap_client.rs`:
1. Add `tls: bool` parameter to `connect()`:
   ```rust
   pub async fn connect(&mut self, host: &str, port: u16,
       username: &str, password: &str, tls: bool) -> Result<()>
   ```
2. If `tls == true`: Current behavior (TLS connect then login)
3. If `tls == false`: Plain TCP connect, then login (no TLS wrapper). This handles local bridges like ProtonMail Bridge.

**Key code shape for plain TCP:**
```rust
if tls {
    // Existing TLS path
    let tls_connector = TlsConnector::new();
    let tls_stream = tls_connector.connect(host, tcp_stream).await?;
    let client = async_imap::Client::new(tls_stream);
    self.session = Some(client.login(username, password).await...);
} else {
    // Plain TCP path (local bridges)
    let client = async_imap::Client::new(tcp_stream);
    // async_imap::Client works with any AsyncRead+AsyncWrite
    // Need to handle the different session type
}
```

**Important:** The `Session` type is generic over the stream type. With TLS it's `Session<TlsStream<TcpStream>>`, without it's `Session<TcpStream>`. This requires either:
- (a) Boxing the session behind `dyn AsyncRead + AsyncWrite` (trait object), or
- (b) Using an enum wrapper for the two stream types

Recommended: Enum wrapper (no runtime overhead):
```rust
enum ImapSession {
    Tls(Session<TlsStream<TcpStream>>),
    Plain(Session<TcpStream>),
}
```

Then add a helper macro or methods that dispatch to the inner session for `select`, `search`, `uid_fetch`, `capabilities`, `logout`.

**Estimated LOC:** ~50 new, ~20 modified

### Task 2.2: Fix sequence number vs UID confusion

**Problem:** `imap_client.rs:71` calls `session.search()` which returns **sequence numbers**, then `imap_client.rs:78` passes those to `uid_fetch()` which expects **UIDs**. This can fetch wrong messages or miss the newest ones.

**Files:**
- Modify: `src/imap_client.rs` (line 71)

Fix: Change `session.search()` to `session.uid_search()`:
```rust
// Before (BROKEN):
let uids = session.search(&query).await?;

// After (CORRECT):
let uids = session.uid_search(&query).await?;
```

The `uid_search()` method returns actual UIDs, which correctly match `uid_fetch()`.

**Also:** The SINCE search uses day granularity (`%d-%b-%Y`), which is an IMAP protocol limitation. To get more precise filtering, add a post-fetch filter on the `date` field. This is a nice-to-have, not critical -- the UID fix is the important part.

**Estimated LOC:** ~5 modified

---

## Phase 3: Safety & Cleanup (High -- prevents crashes)

### Task 3.1: Replace `.unwrap()` panic with error response

**Problem:** `dispatcher.rs:53` does `serde_json::to_value(result).unwrap()`. If serialization fails, the entire process panics and Chrome gets a broken pipe.

**Files:**
- Modify: `src/dispatcher.rs` (line 53, and anywhere else `to_value().unwrap()` appears)

Fix: Use `match` or `?` with an error response:
```rust
match serde_json::to_value(result) {
    Ok(val) => Response { v: 1, id, result: Some(val), error: None },
    Err(e) => error_response(id, "INTERNAL_ERROR", &format!("Serialization failed: {}", e)),
}
```

Audit the entire file for other `.unwrap()` calls on fallible operations and replace them.

**Estimated LOC:** ~10 modified

### Task 3.2: Integrate or remove dead `errors.rs`

**Problem:** `errors.rs` defines `BridgeError` enum with `to_error_code()` method, but it's never used. The dispatcher uses ad-hoc string error codes instead.

**Decision:** Two options:
- **(a) Remove it:** Delete `errors.rs`, remove `mod errors;` from `main.rs`. The dispatcher's ad-hoc approach works fine.
- **(b) Integrate it:** Refactor dispatcher to use `BridgeError` and `?` operator. Cleaner but more churn.

**Recommendation:** Option (a) -- remove it. The ad-hoc `error_response()` function is clear enough. Adding the `BridgeError` type would require refactoring every handler for marginal benefit. YAGNI.

**Files:**
- Delete: `src/errors.rs`
- Modify: `src/main.rs` (remove `mod errors;`)

**Estimated LOC:** ~2 modified, ~40 deleted

---

## Phase 4: Keychain Key Collision Fix (Medium -- data integrity)

**Problem:** Keychain entries use `(InboxBridge:{username}, host)` as the key. If user adds two accounts with the same email on the same host (different ports, different labels), the second password overwrites the first. Removing either account deletes the other's credentials.

**Files:**
- Modify: `src/dispatcher.rs` (lines 122, 166, 261)

**Fix:** Use `accountId` in the keychain service key:
```rust
// Before:
let service = format!("InboxBridge:{}", username);
keychain.store_password(&service, host, password)

// After:
let service = format!("InboxBridge:{}", account_id);
keychain.store_password(&service, &format!("{}:{}", host, port), password)
```

This makes every keychain entry unique per account. The `accountId` is now persisted (Phase 1), so any process can look up the right keychain entry.

**Migration:** Existing accounts (if any) will lose access to their keychain entries. Since InboxBridge has been broken (Phase 1 fixes this), there are effectively zero real users with working accounts. No migration needed -- users will re-add accounts after the fix.

**Estimated LOC:** ~10 modified

---

## Phase 5: Extension Client Consolidation (High -- reduces confusion)

**Problem:** Two completely separate native messaging client implementations:
- `src/lib/providers/imap-bridge/native-client.ts` (211 LOC) -- used by UI (AddImapAccountModal, ImapAccountCard)
- `src/lib/native-messaging/client.ts` (422 LOC) -- used by background (IMAPBridgeAdapter)

Different APIs (`call()` vs `request()`), different singleton patterns, different error types, different reconnection strategies. This caused bugs where bridge check worked in one context but not the other.

### Task 5.1: Unify to single client

**Keep:** `src/lib/native-messaging/client.ts` (the background client) -- it's better structured with typed errors, proper validation, UUID correlation.

**Add to it:**
1. Event listener support (from the UI client's `onEvent`/`offEvent`)
2. `checkInstallStatus()` convenience method
3. Export a `getNativeClient()` function for backward compatibility

**Files:**
- Modify: `src/lib/native-messaging/client.ts`
- Modify: `src/lib/native-messaging/index.ts` (re-export `getNativeClient`)
- Delete: `src/lib/providers/imap-bridge/native-client.ts`
- Modify: `src/ui/components/accounts/AddImapAccountModal.tsx` (update import, `call()` -> `request()`)
- Modify: `src/ui/components/accounts/ImapAccountCard.tsx` (update import)

### Task 5.2: Remove `window.setTimeout` usage

The UI client uses `window.setTimeout` which doesn't exist in service workers. The background client correctly uses plain `setTimeout`. After consolidation, ensure no `window.` references remain.

**Estimated LOC:** ~30 new, ~50 modified, ~211 deleted

---

## Phase 6: Documentation Alignment (Medium -- prevents wrong implementations)

### Task 6.1: Fix INBOXBRIDGE_SPEC.md

**Problem:** The spec documents an old type-based API (`connect`, `listRecent`, `getMessage`, `disconnect`) while the actual implementation uses versioned RPC (`bridge.ping`, `account.add`, `mail.fetchRecent`).

**Files:**
- Modify: `INBOXBRIDGE_SPEC.md`

Either update the spec to match the actual RPC protocol, or add a prominent notice that PROTOCOL.md is the authoritative API reference and the spec's API section is outdated.

**Recommendation:** Add a notice at the top of the API section pointing to PROTOCOL.md. A full spec rewrite is out of scope for this hardening effort.

### Task 6.2: Fix smoke test instructions

**Problem:** README-SETUP.md shows piping raw JSON to the binary, but Native Messaging requires 4-byte length-prefixed framing. The tests silently fail.

**Files:**
- Modify: `README-SETUP.md`

Replace raw `echo '{"v":1,...}' | ./inboxbridge` with a proper framed test using Python or a shell one-liner that prepends the 4-byte length.

### Task 6.3: Fix Python test harness for Windows

**Files:**
- Modify: `test_native_messaging.py` (if it exists in scripts/)

Use `inboxbridge.exe` on Windows, `inboxbridge` on others.

**Estimated LOC:** ~30 modified across docs

---

## Deferred (Future Work)

These items are real but don't block IMAP from working:

| Item | Why Deferred |
|------|-------------|
| **Watch polling implementation** (M1) | Feature, not a bug. Requires its own design (polling interval, event streaming, resource limits). Current workaround: manual sync. |
| **Protocol version enforcement** (L1) | Decorative until we have v2. No breakage risk currently. |
| **Uninstall credential cleanup** (M6) | Edge case. Credentials in keychain aren't harmful. |
| **Hardcoded extension ID** (M3) | Only affects dev workflow. Document the workaround. |
| **Reconnection from service worker** (M4) | The client consolidation (Phase 5) removes the problematic UI client. Background client doesn't auto-reconnect, which is correct for service workers. |
| **Orphan detection** (M5) | Nice-to-have. Can be a `diagnostics.get` endpoint later. |

---

## Verification

After each phase:
1. `cargo test` -- all Rust tests pass
2. `cargo build --release` -- binary builds
3. `npm run build` (from `/extension`) -- extension builds

After Phase 1 + 2 combined (minimum viable fix):
4. Manual test: Add IMAP account via options page
5. Verify `accounts.json` created with account data
6. Trigger sync from popup -- verify no "Account not found" error
7. Verify emails fetched correctly (if real IMAP server available)

---

## Summary

| Phase | What | Severity | Est. LOC | Depends On |
|-------|------|----------|----------|------------|
| 1 | Account Persistence | Critical | ~90 | -- |
| 2 | TLS + UID Correctness | High | ~55 | Phase 1 (for testing) |
| 3 | Panic Fix + Dead Code | High | ~12 | -- |
| 4 | Keychain Key Collision | Medium | ~10 | Phase 1 |
| 5 | Client Consolidation | High | ~290 (net -150) | -- |
| 6 | Documentation | Medium | ~30 | Phase 2 |
| | **Total** | | **~490 gross** | |

**Phases 1+2 are the minimum to make IMAP work.** Everything else is hardening.

**Parallelization:** Phases 3 and 5 can run in parallel with Phases 1+2 (no file overlap). Phase 4 depends on Phase 1. Phase 6 depends on Phase 2.
