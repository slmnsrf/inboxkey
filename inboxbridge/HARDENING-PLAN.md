# InboxBridge Hardening Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** Fix all Critical and High findings from the dual-audit (Claude + Codex) to make InboxBridge production-ready for IMAP sync.

**Architecture:** InboxBridge is a Rust native messaging host (stdio). Chrome launches a separate process per `connectNative()` call. Accounts are currently in-memory only, which is the root cause of all sync failures. The fix strategy is: persist accounts to disk with every read and write going through disk under a lock file (no in-memory cache), then fix correctness bugs (TLS, UID), then clean up safety issues.

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
  - Linux: `~/.local/share/inboxbridge/accounts.json` (lowercase per Linux convention)
- **No in-memory cache. Every operation goes to disk.** This is the simplest correct model and eliminates all stale-read and stale-snapshot bugs. The file is <2KB for 20 accounts; disk I/O is negligible for the frequency of operations (a few times per minute at most). Specifically:
  - **Reads** (`get_account`, `list_accounts`): Acquire shared lock on `accounts.lock` -> read and parse `accounts.json` -> release lock -> return data.
  - **Writes** (`add_account`, `remove_account`): Acquire exclusive lock on `accounts.lock` -> read current `accounts.json` -> apply mutation -> write result directly to `accounts.json` -> release lock.
  - This means every process always sees the latest state from any other process, with zero risk of stale snapshots or last-writer-wins races.
- **Lock file:** `accounts.lock` is a separate file used only for `fs2` locking. It is never renamed or deleted. This avoids Windows issues where renaming a file with an open handle fails.
- **Write strategy:** Under the exclusive lock, write directly to `accounts.json` (not rename). Since the lock prevents concurrent access, a partial write on crash is the only risk, and corruption recovery handles that. The lock guarantees no reader sees a half-written file.
- **Corruption recovery (lock-correct, self-repairing):**
  - **All paths repair under exclusive lock.** File mutation never happens under shared lock.
  - **Readers** (`read_accounts()`): On parse failure, release shared lock, re-acquire exclusive, re-check (another process may have repaired), then call `repair_corrupt_file()` if still corrupt. Returns empty HashMap after repair. This ensures a read-only process (e.g. background sync) doesn't stay broken indefinitely waiting for a write that may never come.
  - **Writers** (`read_modify_write()`, startup): Already hold exclusive lock, call `repair_corrupt_file()` directly on parse failure.
  - **Net effect:** Any process encountering corruption repairs it immediately. No restart needed. No process-local flags. **Disk is the sole source of truth across all processes.**
  - Two helpers enforce the discipline: `try_parse()` (pure, no side effects) and `repair_corrupt_file()` (mutates files, exclusive-lock only).
- **Lock-first discipline:** Every path that touches `accounts.json` acquires the lock BEFORE checking file existence. This prevents TOCTOU races where a reader sees "no file" while a writer is creating it under exclusive lock.
- **Test isolation:** `AppState` accepts an optional `storage_dir` override. Tests inject a temp directory path so they never touch the real user data dir.

### Task 1.1: Add `dirs` and `fs2` dependencies

**Files:**
- Modify: `Cargo.toml`

Add to `[dependencies]`:
```toml
dirs = "5"
fs2 = "0.4"
```

`dirs` resolves platform-specific directories. `fs2` provides cross-platform file locking (`lock_exclusive()`, `lock_shared()`) on the lock file.

### Task 1.2: Rewrite AppState as disk-backed store

**Files:**
- Modify: `src/state.rs`

Replace the in-memory HashMap design with a disk-backed store. No `Arc<RwLock<HashMap>>` for accounts. Every method hits disk under the lock.

**Key code shape:**
```rust
use serde::{Serialize, Deserialize};
use fs2::FileExt;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub username: String,
}

pub struct AppState {
    storage_dir: PathBuf,
}

impl AppState {
    /// Initialize storage.
    /// Pass None for default platform path, or Some(dir) for test isolation.
    pub fn new(custom_dir: Option<PathBuf>) -> Self {
        let dir = custom_dir.unwrap_or_else(Self::default_storage_dir);
        std::fs::create_dir_all(&dir).ok();

        let state = Self { storage_dir: dir };

        // Startup corruption check under exclusive lock.
        // Best-effort early repair; runtime paths also handle corruption.
        if let Ok(lock_file) = state.open_lock_file() {
            if lock_file.lock_exclusive().is_ok() {
                let data_path = state.data_path();
                if data_path.exists() {
                    if let Ok(json) = std::fs::read_to_string(&data_path) {
                        if Self::try_parse(&json).is_none() {
                            state.repair_corrupt_file();
                        }
                    }
                }
                // lock released on drop
            }
        }

        state
    }

    fn default_storage_dir() -> PathBuf {
        let base = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        // Windows/macOS: "InboxBridge" (convention: title-case app dirs)
        // Linux: "inboxbridge" (convention: lowercase in ~/.local/share/)
        if cfg!(target_os = "linux") {
            base.join("inboxbridge")
        } else {
            base.join("InboxBridge")
        }
    }

    fn data_path(&self) -> PathBuf {
        self.storage_dir.join("accounts.json")
    }

    fn lock_path(&self) -> PathBuf {
        self.storage_dir.join("accounts.lock")
    }

    fn open_lock_file(&self) -> Result<std::fs::File, String> {
        std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(self.lock_path())
            .map_err(|e| format!("Failed to open lock file: {}", e))
    }

    /// Parse JSON into accounts map. On failure, return None (no file mutation).
    /// Callers decide how to handle based on their lock level.
    fn try_parse(json: &str) -> Option<HashMap<String, Account>> {
        serde_json::from_str(json).ok()
    }

    /// Repair corrupt accounts.json: backup then delete.
    /// MUST only be called under exclusive lock (mutates files).
    fn repair_corrupt_file(&self) {
        let data_path = self.data_path();
        let backup = data_path.with_extension("json.bak");
        std::fs::copy(&data_path, &backup).ok();
        std::fs::remove_file(&data_path).ok();
        eprintln!(
            "WARNING: accounts.json corrupt. Backed up to {:?}. \
             Re-add accounts in Settings to recover.",
            backup
        );
    }

    /// Read all accounts from disk under shared lock.
    /// Lock acquired BEFORE existence check to prevent TOCTOU race.
    /// On parse failure: releases shared lock, re-acquires exclusive,
    /// repairs the file, then returns empty map. This ensures a read-only
    /// process (e.g. background sync) doesn't stay broken indefinitely.
    fn read_accounts(&self) -> Result<HashMap<String, Account>, String> {
        let lock_file = self.open_lock_file()?;
        lock_file.lock_shared()
            .map_err(|e| format!("Failed to acquire shared lock: {}", e))?;

        let data_path = self.data_path();
        if !data_path.exists() {
            return Ok(HashMap::new());
        }

        let json = std::fs::read_to_string(&data_path)
            .map_err(|e| format!("Failed to read accounts: {}", e))?;

        if let Some(accounts) = Self::try_parse(&json) {
            return Ok(accounts);
        }

        // Parse failed: upgrade to exclusive lock to repair.
        // Release shared lock first (fs2 doesn't support in-place upgrade).
        lock_file.unlock()
            .map_err(|e| format!("Failed to release shared lock: {}", e))?;
        lock_file.lock_exclusive()
            .map_err(|e| format!("Failed to acquire exclusive lock for repair: {}", e))?;

        // Re-check after acquiring exclusive lock -- another process may
        // have already repaired or deleted the file while we waited.
        if data_path.exists() {
            if let Ok(json2) = std::fs::read_to_string(&data_path) {
                if let Some(accounts) = Self::try_parse(&json2) {
                    // Another process repaired it. Use the good data.
                    return Ok(accounts);
                }
            }
            // Still corrupt (or unreadable). Repair under exclusive lock.
            self.repair_corrupt_file();
        }

        // lock released on drop
        Ok(HashMap::new())
    }

    /// Transactional read-modify-write under exclusive lock.
    /// On parse failure: repairs file (backup + delete) then starts from empty.
    /// Safe because we hold the exclusive lock -- no concurrent readers/writers.
    fn read_modify_write<F>(&self, mutation_fn: F) -> Result<(), String>
    where
        F: FnOnce(&mut HashMap<String, Account>),
    {
        let data_path = self.data_path();

        let lock_file = self.open_lock_file()?;
        lock_file.lock_exclusive()
            .map_err(|e| format!("Failed to acquire exclusive lock: {}", e))?;

        // Read current state from disk, repairing corruption under exclusive lock
        let mut accounts: HashMap<String, Account> = if data_path.exists() {
            let json = std::fs::read_to_string(&data_path)
                .map_err(|e| format!("Failed to read accounts: {}", e))?;
            match Self::try_parse(&json) {
                Some(accts) => accts,
                None => {
                    self.repair_corrupt_file();
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };

        // Apply mutation
        mutation_fn(&mut accounts);

        // Write directly to accounts.json (under exclusive lock, no rename needed)
        let json = serde_json::to_string_pretty(&accounts)
            .map_err(|e| format!("Serialization failed: {}", e))?;
        std::fs::write(&data_path, &json)
            .map_err(|e| format!("Failed to write accounts: {}", e))?;

        // lock released on drop
        Ok(())
    }

    /// Get a single account by ID (reads from disk)
    pub fn get_account(&self, id: &str) -> Result<Option<Account>, String> {
        let accounts = self.read_accounts()?;
        Ok(accounts.get(id).cloned())
    }

    /// List all accounts (reads from disk)
    pub fn list_accounts(&self) -> Result<Vec<Account>, String> {
        let accounts = self.read_accounts()?;
        Ok(accounts.into_values().collect())
    }

    /// Add account (transactional read-modify-write)
    pub fn add_account(&self, account: Account) -> Result<String, String> {
        let id = account.id.clone();

        self.read_modify_write(|accounts| {
            accounts.insert(account.id.clone(), account);
        })?;

        Ok(id)
    }

    /// Remove account (transactional read-modify-write)
    pub fn remove_account(&self, id: &str) -> Result<bool, String> {
        let mut removed = false;
        let id_owned = id.to_string();

        self.read_modify_write(|accounts| {
            removed = accounts.remove(&id_owned).is_some();
        })?;

        Ok(removed)
    }
}
```

**Key properties:**
- `get_account()` and `list_accounts()` always read from disk under shared lock -- never stale
- `add_account()` and `remove_account()` use exclusive lock with read-modify-write -- never lost updates
- No `Arc<RwLock<HashMap>>` cache -- zero cache coherency bugs
- **No process-local flags** -- disk is the sole source of truth. If Process B repairs storage, Process A sees it on the next disk read without restarting. Cross-process recovery is automatic.
- Corruption recovery is self-repairing at every path: readers upgrade to exclusive lock on parse failure, repair, and return empty. Writers repair directly. No file mutation ever under shared lock.
- Direct write under exclusive lock (no rename) -- works on all platforms including Windows
- Methods are synchronous (`fn`, not `async fn`) since file I/O is ~microseconds. The async dispatcher can call them directly without `spawn_blocking` for a <2KB file.

### Task 1.3: Use `AppState::new()` in main.rs

**Files:**
- Modify: `src/main.rs:21`

Change `AppState::new()` to `AppState::new(None)`.

### Task 1.4: Update dispatcher for new AppState API

**Files:**
- Modify: `src/dispatcher.rs`

1. All `state.get_account()`, `state.list_accounts()`, `state.add_account()`, and `state.remove_account()` calls now return `Result` -- handle `Err` as RPC error responses. No process-local flags to check; errors from disk I/O are the signal.
   ```rust
   // Example: handle_mail_fetch_recent
   let account = match state.get_account(&account_id) {
       Ok(Some(acct)) => acct,
       Ok(None) => return error_response(id, "ACCOUNT_NOT_FOUND", "Account not found"),
       Err(e) => return error_response(id, "STORAGE_ERROR", &e),
   };
   ```
2. This naturally handles cross-process recovery: if Process A starts with corrupt storage (file deleted during startup), and Process B repairs it via `account.add`, Process A's next `get_account()` reads from disk and succeeds -- no restart needed.
3. Remove `async` from handler functions that only do sync state operations (or keep `async` and just `.await` nothing -- either works).

### Task 1.5: Update existing tests with injected paths

**Files:**
- Modify: `src/state.rs` (test section)

All tests use `AppState::new(Some(temp_dir))` with a unique temp directory per test (`std::env::temp_dir().join(format!("inboxbridge_test_{}", uuid))`). No test touches the real user data dir.

Tests:
1. `test_account_lifecycle` -- add, get, remove, verify gone
2. `test_persistence_roundtrip` -- add account via AppState A, create AppState B from same dir, verify B sees the account
3. `test_cross_process_write_safety` -- AppState A adds account X, AppState B (same dir) adds account Y, verify both X and Y present when read by either
4. `test_corrupt_file_recovery` -- write garbage to accounts.json, create AppState, verify `.bak` created, verify corrupt file deleted, verify `list_accounts()` returns empty (file gone), verify `add_account()` succeeds and creates fresh file, verify `get_account()` on newly added account works
5. `test_empty_dir_first_run` -- new temp dir, verify empty list, add account, verify file created
6. `test_read_path_repairs_corruption` -- add account via AppState, verify it exists, then overwrite `accounts.json` with garbage (simulating another process crashing mid-write), call `list_accounts()` on the same AppState instance (long-lived process), verify `.bak` created, corrupt file deleted, returns empty list. Then call `add_account()`, verify new file created and subsequent `get_account()` works. This validates the reader-side lock-upgrade repair path.

### Task 1.6: Verify end-to-end

Build InboxBridge (`cargo build --release`). Manually test:
1. Extension options page: Add IMAP account (calls `account.add`)
2. Check `accounts.json` file exists at platform data dir with the account data
3. Background sync: Trigger sync (calls `mail.fetchRecent`)
4. Verify "Account not found" error is gone
5. Verify `accounts.lock` file exists alongside `accounts.json`

**Estimated LOC:** ~150 new, ~30 modified (net reduction from removing Arc/RwLock/cache complexity)

---

## Phase 2: IMAP Correctness (High -- fetches return wrong results)

### Task 2.1: Pass TLS flag through to ImapClient with loopback guard

**Problem:** UI sends `tls: false` for ProtonMail Bridge (port 1143), but `account.add` hardcodes `tls: true` (`dispatcher.rs:134`), `account.test` ignores the flag (`dispatcher.rs:187`), and `ImapClient::connect()` always does immediate TLS (`imap_client.rs:29-33`).

**Security constraint:** `tls: false` (plaintext IMAP login) sends credentials in cleartext. This is only safe for local bridges (ProtonMail Bridge, etc.) running on loopback. To prevent credential leaks to arbitrary hosts, **restrict `tls: false` to loopback addresses only** (`127.0.0.1`, `::1`, `localhost`). If `tls: false` is requested for a non-loopback host, return `INVALID_PARAMS` error: "Plaintext connections are only allowed to localhost/127.0.0.1 (local bridges)."

**Files:**
- Modify: `src/dispatcher.rs` (lines 110-136, 183-237)
- Modify: `src/imap_client.rs` (lines 17-44)

Changes to `dispatcher.rs`:
1. Add a `validate_tls_policy(host, tls)` helper:
   ```rust
   fn is_loopback_host(host: &str) -> bool {
       matches!(host, "127.0.0.1" | "::1" | "localhost")
   }

   fn validate_tls_policy(host: &str, tls: bool) -> Result<(), (&'static str, &'static str)> {
       if !tls && !is_loopback_host(host) {
           return Err(("INVALID_PARAMS",
               "Plaintext connections are only allowed to localhost/127.0.0.1 (local bridges). \
                Enable TLS for remote servers."));
       }
       Ok(())
   }
   ```
2. In `handle_account_add`: Read `tls` from params, validate with `validate_tls_policy()`:
   ```rust
   let tls = params["tls"].as_bool().unwrap_or(true);
   if let Err((code, msg)) = validate_tls_policy(host, tls) {
       return error_response(id, code, msg);
   }
   ```
3. In `handle_account_test`: Same validation + pass `tls` to ImapClient.
4. In `handle_mail_fetch_recent`: Pass `account.tls` to ImapClient (already stored in Account struct, now correctly persisted).

Changes to `imap_client.rs`:
1. Add `tls: bool` parameter to `connect()`:
   ```rust
   pub async fn connect(&mut self, host: &str, port: u16,
       username: &str, password: &str, tls: bool) -> Result<()>
   ```
2. If `tls == true`: Current behavior (TLS connect then login)
3. If `tls == false`: Plain TCP connect, then login (no TLS wrapper). For local bridges only (enforced by dispatcher).

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

**Estimated LOC:** ~60 new, ~20 modified

### Task 2.2: Fix UID confusion + fetch ordering + timestamp filtering

**Problem (three issues in `imap_client.rs:list_recent()`):**

1. **UID vs sequence:** `session.search()` (line 71) returns sequence numbers, but `uid_fetch()` (line 78) expects UIDs. Fix: use `uid_search()`.

2. **Unordered truncation:** `uids.iter().take(limit)` (line 76) iterates an unordered `HashSet` and takes arbitrary entries. If there are 100 messages from today but `limit=15`, we get 15 random ones, likely missing the newest verification codes.

3. **Day-granular SINCE:** IMAP SINCE uses `DD-Mon-YYYY` format (line 68), so a 10-minute window becomes "all messages from today." Combined with unordered truncation, this returns arbitrary same-day mail.

**Files:**
- Modify: `src/imap_client.rs` (lines 67-127)

**Fix:**
```rust
pub async fn list_recent(&mut self, since_minutes: u32, limit: usize) -> Result<Vec<EmailMessage>> {
    let session = self.session.as_mut()
        .context("Not connected to IMAP server")?;

    session.select("INBOX").await?;

    // SINCE is day-granular (IMAP limitation) -- we'll post-filter below
    let since_date = Utc::now() - chrono::Duration::minutes(since_minutes as i64);
    let date_str = since_date.format("%d-%b-%Y").to_string();

    let query = format!("SINCE {}", date_str);

    // FIX 1: Use uid_search (returns UIDs) instead of search (returns sequence numbers)
    let uids = session.uid_search(&query).await?;

    // FIX 2: Sort UIDs descending (higher UID = newer message) so we fetch newest first
    let mut uid_vec: Vec<u32> = uids.into_iter().collect();
    uid_vec.sort_unstable_by(|a, b| b.cmp(a)); // Newest first

    let mut messages = Vec::new();
    let cutoff_ms = since_date.timestamp_millis();

    // Fetch more than limit to account for post-filter (but cap to avoid fetching thousands)
    let fetch_limit = (limit * 2).min(50);

    for uid in uid_vec.iter().take(fetch_limit) {
        let mut fetch_stream = session
            .uid_fetch(uid.to_string(), "(ENVELOPE BODY.PEEK[TEXT]<0.2000>)")
            .await?;

        while let Some(fetch_result) = fetch_stream.next().await {
            let msg = fetch_result?;

            if let Some(envelope) = msg.envelope() {
                // ... extract from, subject, date, snippet (existing code) ...

                // FIX 3: Post-filter by actual timestamp
                let parsed_date = chrono::DateTime::parse_from_rfc2822(&date)
                    .or_else(|_| chrono::DateTime::parse_from_str(&date, "%a, %d %b %Y %H:%M:%S %z"))
                    .ok();

                if let Some(dt) = parsed_date {
                    if dt.timestamp_millis() < cutoff_ms {
                        continue; // Skip messages older than the actual requested window
                    }
                }
                // If date can't be parsed, include (better to over-include than miss codes)

                messages.push(EmailMessage { uid: *uid, date, from, subject, snippet });

                if messages.len() >= limit {
                    break;
                }
            }
        }

        if messages.len() >= limit {
            break;
        }
    }

    Ok(messages)
}
```

**Key changes:**
- `search()` -> `uid_search()` (correct UID semantics)
- Sort UIDs descending before iterating (deterministic newest-first order)
- Post-fetch timestamp filter against actual `since_minutes` cutoff (compensates for day-granular SINCE)
- `take(limit)` applied after sort and filter, not before

**Estimated LOC:** ~25 modified

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

### Task 3.2: Make `watch.start` return UNIMPLEMENTED error

**Problem:** `watch.start` creates a Watch struct in RAM and returns a `watchId` as if it succeeded, but the actual polling loop is a `// TODO` comment. This is a protocol lie -- callers think watching is active when nothing is happening.

**Files:**
- Modify: `src/dispatcher.rs` (lines 300-338)

Fix: Replace the current handler with an explicit error:
```rust
"watch.start" => error_response(id, "UNIMPLEMENTED",
    "watch.start is not yet implemented. Use manual sync via mail.fetchRecent."),
"watch.stop" => error_response(id, "UNIMPLEMENTED",
    "watch.stop is not yet implemented."),
```

Remove the `Watch` struct from `state.rs` and all watch-related methods (`add_watch`, `get_watch`, `remove_watch`) since they serve no purpose without the polling implementation.

**Estimated LOC:** ~10 modified, ~30 deleted

### Task 3.3: Remove dead `errors.rs`

**Problem:** `errors.rs` defines `BridgeError` enum with `to_error_code()` method, but it's never used. The dispatcher uses ad-hoc string error codes instead.

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

**Note for Phase 6:** The `keyring` crate's `Entry::new(service, user)` maps to platform-specific credential identifiers internally (the exact format varies by backend and crate version). Phase 6 cleanup uses the same `keyring` crate code with the same `(service, user)` arguments, so it always matches -- no need to know the internal format.

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

## Phase 6: Lifecycle & Documentation Cleanup (Medium)

### Task 6.1: Credential cleanup on uninstall via InboxBridge binary

**Problem:** When an account is removed via `account.remove`, the keychain entry is deleted. But if InboxBridge is uninstalled entirely, the uninstall scripts remove files and registry entries but leave stored passwords in the OS keychain. For a privacy-first product, this is a real lifecycle issue.

**Design:** Shell commands (`security delete-generic-password`, `secret-tool clear`, `cmdkey /delete`) don't reliably match the `keyring` crate's internal credential identifier format, which varies by platform backend and crate version. Rather than reverse-engineering these formats in shell scripts, **use InboxBridge itself to clean up.** Add a `--cleanup` CLI flag that reads `accounts.json`, deletes each account's keychain entry using the same `keyring` crate code that stored it, then exits.

**Files:**
- Modify: `src/main.rs` -- add `--cleanup` arg parsing before the stdio loop:
  ```rust
  if std::env::args().any(|a| a == "--cleanup") {
      let state = AppState::new(None);
      for account in state.list_accounts().unwrap_or_default() {
          let service = format!("InboxBridge:{}", account.id);
          let user = format!("{}:{}", account.host, account.port);
          // Uses same keyring::Entry API that stored the credential
          // (keyring v2: Entry::new + delete_password, matching keychain.rs)
          if let Ok(entry) = keyring::Entry::new(&service, &user) {
              entry.delete_password().ok();
          }
      }
      std::process::exit(0);
  }
  ```
- Modify: `setup-macos.sh` (uninstall section) -- call `"$HOME/Library/Application Support/InboxBridge/inboxbridge" --cleanup` before removing files
- Modify: `setup-linux.sh` (uninstall section) -- call `"$HOME/.local/bin/inboxbridge" --cleanup` before removing files
- Modify: `setup-windows.sh` (uninstall section) -- call `& "C:\Program Files\InboxBridge\inboxbridge.exe" --cleanup` before removing files/registry

Note: These script files are at the root of `inboxbridge/`, NOT in a `scripts/` subdirectory.

If `accounts.json` is missing or corrupt, `--cleanup` skips credential deletion gracefully (list_accounts returns empty).

**Estimated LOC:** ~20 new in main.rs, ~10 per script (3 scripts)

### Task 6.2: Fix INBOXBRIDGE_SPEC.md

**Problem:** The spec documents an old type-based API (`connect`, `listRecent`, `getMessage`, `disconnect`) while the actual implementation uses versioned RPC (`bridge.ping`, `account.add`, `mail.fetchRecent`).

**Files:**
- Modify: `INBOXBRIDGE_SPEC.md`

Add a prominent notice at the top of the API section pointing to PROTOCOL.md as the authoritative API reference. A full spec rewrite is out of scope for this hardening effort.

### Task 6.3: Fix smoke test instructions

**Problem:** README-SETUP.md shows piping raw JSON to the binary, but Native Messaging requires 4-byte length-prefixed framing. The tests silently fail.

**Files:**
- Modify: `README-SETUP.md`

Replace raw `echo '{"v":1,...}' | ./inboxbridge` with a proper framed test using Python or a shell one-liner that prepends the 4-byte length.

### Task 6.4: Fix Python test harness for Windows

**Files:**
- Modify: `test_native_messaging.py` (if it exists at inboxbridge root or scripts/)

Use `inboxbridge.exe` on Windows, `inboxbridge` on others.

**Estimated LOC:** ~50 new, ~30 modified across code/scripts/docs

---

## Deferred (Future Work)

These items are real but don't block IMAP from working:

| Item | Why Deferred |
|------|-------------|
| **Watch polling implementation** | Requires its own design cycle (polling interval, IMAP IDLE, event streaming, resource limits). `watch.start` now returns `UNIMPLEMENTED` (Phase 3) so callers know it's not available. |
| **Protocol version enforcement** (L1) | Decorative until we have v2. No breakage risk currently. |
| **Hardcoded extension ID** (M3) | Only affects dev workflow. Document the workaround. |
| **Orphan detection** (M5) | Nice-to-have. Can be a `diagnostics.get` endpoint later. |

---

## Platform Compatibility (Windows 1st, macOS 2nd, Linux 3rd)

Every design decision in this plan has been verified for cross-platform correctness, with Windows as the primary target. Key platform-specific details:

### File Locking (`fs2` crate)

| Platform | Mechanism | Lock Type | Crash Behavior |
|----------|-----------|-----------|----------------|
| **Windows** | `LockFileEx` / `UnlockFileEx` | Mandatory (kernel-enforced) | Auto-released by OS on process exit/crash |
| **macOS** | `flock()` | Advisory (cooperative) | Auto-released by OS on process exit/crash |
| **Linux** | `flock()` | Advisory (cooperative) | Auto-released by OS on process exit/crash |

The separate lock file (`accounts.lock`) is critical for Windows. We never lock `accounts.json` directly because:
- Windows mandatory locks would prevent other processes from opening the data file at all
- The lock file is a coordination sentinel -- processes lock it, then read/write the data file transiently (open, read/write, close)
- `std::fs::write()` in Rust opens with `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE` by default, so no sharing violations occur

### Data Directory (`dirs` crate)

| Platform | `dirs::data_dir()` | Full Path |
|----------|---------------------|-----------|
| **Windows** | `%APPDATA%` | `C:\Users\<user>\AppData\Roaming\InboxBridge\accounts.json` |
| **macOS** | `~/Library/Application Support` | `~/Library/Application Support/InboxBridge/accounts.json` |
| **Linux** | `~/.local/share` | `~/.local/share/inboxbridge/accounts.json` |

Note: The binary installs to a separate location (`C:\Program Files\InboxBridge\` on Windows). The data directory is user-scoped and writable without elevation.

### Credential Storage (`keyring` v2 crate)

| Platform | Backend |
|----------|---------|
| **Windows** | Windows Credential Manager |
| **macOS** | Keychain Services |
| **Linux** | Secret Service (GNOME Keyring / KWallet) |

The exact credential identifier format is internal to the `keyring` crate and varies by backend and version. We never need to know it because the `--cleanup` CLI flag (Phase 6) uses the same `keyring::Entry::new(service, user)` code with the same arguments that stored the credentials, so it always matches.

### Native Messaging Manifest

| Platform | Manifest Location | Registration |
|----------|-------------------|-------------|
| **Windows** | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.inboxkey.bridge` pointing to JSON file | PowerShell `New-ItemProperty` |
| **macOS** | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.inboxkey.bridge.json` | File copy |
| **Linux** | `~/.config/google-chrome/NativeMessagingHosts/com.inboxkey.bridge.json` (+ Chromium, Brave, Edge variants) | File copy |

### Process Lifecycle

Chrome launches a new native process per `connectNative()` call on all platforms. The process communicates over stdin/stdout with 4-byte length-prefixed JSON. Key behaviors:
- **Windows:** Process terminated via `TerminateProcess` when port disconnects. File locks released by kernel.
- **macOS/Linux:** Process receives `SIGTERM` when port disconnects. File locks released by kernel.
- All platforms: each process is independent. The disk-backed store (Phase 1) is the shared state mechanism.

### Corruption Recovery Race Safety

If multiple processes start simultaneously and encounter corrupt data:
- Process A: copies `accounts.json` to `accounts.json.bak`, deletes `accounts.json`
- Process B: finds `accounts.json` already deleted (Process A got there first), starts with empty state
- The `.ok()` calls on `copy`/`remove_file` swallow errors from this harmless race

### Script Portability (Phase 6)

| Script | Platform | `--cleanup` Invocation |
|--------|----------|----------------------|
| `setup-windows.sh` | PowerShell (embedded heredoc) | `& "C:\Program Files\InboxBridge\inboxbridge.exe" --cleanup` |
| `setup-macos.sh` | Bash | `"$HOME/Library/Application Support/InboxBridge/inboxbridge" --cleanup` |
| `setup-linux.sh` | Bash | `"$HOME/.local/bin/inboxbridge" --cleanup` |

---

## Verification

After each phase:
1. `cargo test` -- all Rust tests pass (tests use injected temp paths, never touch real data)
2. `cargo build --release` -- binary builds
3. `npm run build` (from `/extension`) -- extension builds

After Phase 1 + 2 combined (minimum viable fix):
4. Manual test: Add IMAP account via options page
5. Verify `accounts.json` created at platform data dir with account data
6. Verify `accounts.lock` exists alongside it
7. Trigger sync from popup -- verify no "Account not found" error
8. Verify fetched emails are newest-first and within the requested time window
9. Test TLS guard: attempt `tls: false` with non-loopback host, verify rejection
10. Test corruption recovery: corrupt `accounts.json`, verify `.bak` created, corrupt file deleted, `list_accounts()` returns empty, `account.add` creates fresh file and subsequent reads succeed

---

## Summary

| Phase | What | Severity | Est. LOC | Depends On |
|-------|------|----------|----------|------------|
| 1 | Account Persistence (disk-backed, no cache) | Critical | ~180 | -- |
| 2 | TLS (loopback guard) + UID + fetch ordering | High | ~85 | Phase 1 (for testing) |
| 3 | Panic Fix + watch.start error + Dead Code | High | ~22 | -- |
| 4 | Keychain Key Collision | Medium | ~10 | Phase 1 |
| 5 | Client Consolidation | High | ~290 (net -150) | -- |
| 6 | Credential Cleanup (via --cleanup) + Documentation | Medium | ~80 | Phase 4 (keychain format) |
| | **Total** | | **~670 gross** | |

**Phases 1+2 are the minimum to make IMAP work.** Everything else is hardening.

**Parallelization:** Phases 3 and 5 can run in parallel with Phases 1+2 (no file overlap). Phase 4 depends on Phase 1. Phase 6 depends on Phase 4 (needs final keychain key format).

---

## Changelog

- **v11 (Codex review #9):** Added `test_read_path_repairs_corruption` to Task 1.5 -- validates the reader-side lock-upgrade repair path on a long-lived AppState instance.
- **v10 (Codex review #8):** `read_accounts()` now self-repairs on corruption: releases shared lock, re-acquires exclusive, re-checks (another process may have repaired), then calls `repair_corrupt_file()` if still corrupt. This ensures a read-only process (background sync) doesn't stay broken indefinitely returning empty/not-found while waiting for a write that may never come. All file mutation still only happens under exclusive lock.
- **v9 (Codex review #7):** Split corruption recovery into two tiers respecting lock semantics. Fixed `--cleanup` snippet to use `entry.delete_password()` matching the actual keyring v2 API in `keychain.rs`.
- **v8 (Codex review #6):** Extracted inline corruption recovery for all read paths. Removed stale "degraded mode" reference from Task 1.3. Fixed `--cleanup` snippet to use `keyring::Entry` instead of undefined `keychain` variable.
- **v7 (Codex review #5):** Startup corruption recovery now acquires exclusive lock before touching `accounts.json` -- prevents racing with a concurrent write and misidentifying valid in-progress data as corruption. `read_accounts()` now acquires shared lock BEFORE checking file existence -- eliminates TOCTOU race where a reader sees "no file" while a writer is creating it. Fixed Linux path casing: `default_storage_dir()` now uses `cfg!(target_os = "linux")` to select lowercase `inboxbridge` (Linux convention) vs title-case `InboxBridge` (Windows/macOS convention). Added "lock-first discipline" design bullet to make the invariant explicit.
- **v6 (Codex review #4):** Removed process-local `storage_error` flag entirely -- disk is the sole source of truth across all processes. If Process B repairs storage (via `account.add`), Process A sees it on its next disk read without restarting. Dispatcher now handles `Result::Err` from disk operations directly as RPC errors, no flag-checking. Removed contradictory keyring credential identifier format claims (exact format is internal to crate, irrelevant since `--cleanup` uses same crate code). Fixed `--cleanup` invocation paths to use actual installed binary locations: macOS `~/Library/Application Support/InboxBridge/inboxbridge`, Linux `~/.local/bin/inboxbridge`, Windows `C:\Program Files\InboxBridge\inboxbridge.exe`.
- **v5 (Windows-first platform review):** Added comprehensive "Platform Compatibility" section documenting verified cross-platform behavior for: `fs2` file locking (mandatory on Windows, advisory on Unix -- both auto-release on crash), `dirs::data_dir()` paths per OS, `keyring` v2 credential storage backends, native messaging manifest registration, process lifecycle (TerminateProcess vs SIGTERM), corruption recovery race safety, and setup script `--cleanup` invocation per platform.
- **v4 (Codex review #3):** Eliminated in-memory cache entirely -- every read goes to disk under shared lock, every write uses exclusive lock read-modify-write. This fixes stale reads across long-lived processes. Corruption recovery now deletes the corrupt file (after backup) so `read_modify_write` starts clean instead of re-parsing bad data. Replaced atomic-rename with direct write under exclusive lock to avoid Windows `rename`-over-existing-file failure. Changed uninstall credential cleanup from shell commands to `--cleanup` CLI flag that uses the same `keyring` crate code, matching the exact platform credential identifier format.
- **v3 (Codex review #2):** Replaced snapshot-persist model with transactional read-modify-write under separate lock file -- eliminates cross-process lost updates (Phase 1). Added deterministic newest-first UID sorting + post-fetch timestamp filtering to `list_recent()` (Phase 2). Unified corruption recovery into one consistent rule (Phase 1). Changed to separate `.lock` file (Phase 1). Fixed script paths (Phase 6).
- **v2 (Codex review #1):** Added `fs2` file locking for cross-process safety (Phase 1). Added loopback guard for `tls: false` (Phase 2). Changed corruption recovery to fail-closed with `.bak` preservation (Phase 1). Changed `watch.start`/`watch.stop` to return `UNIMPLEMENTED` (Phase 3). Moved uninstall credential cleanup from Deferred to Phase 6. Added test isolation via injected temp paths.
