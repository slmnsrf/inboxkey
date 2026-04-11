//! Atomic uninstall cleanup orchestration.
//!
//! This module owns the "wipe everything the bridge persisted" operation
//! shared by two callers:
//!
//! 1. The `bridge.uninstall` RPC method, invoked by the extension's
//!    uninstall modal.
//! 2. The `--cleanup` CLI flag, invoked by installer uninstall scripts
//!    (e.g. Windows Inno Setup `[UninstallRun]`).
//!
//! Both callers get identical behavior because composing `AppState` and
//! `KeychainManager` in one place is the only way to guarantee the
//! bridge's state-file cleanup and keychain cleanup stay in sync.
//!
//! # Ordering
//!
//! 1. Snapshot `accounts.json` into memory. If this fails, we abort with
//!    `CleanupError::SnapshotReadFailed` and touch nothing -- without the
//!    snapshot we cannot compute the keychain keys that need removing.
//! 2. Delete each keychain entry, collecting per-entry outcomes. A failure
//!    on one entry does not abort the loop; it is reported as a
//!    `KeychainFailure`.
//! 3. Delete `accounts.json` under an exclusive lock. A failure here is
//!    reported as `CleanupError::AccountsFileDeleteFailed` *after* the
//!    keychain work already happened, so the caller knows credentials are
//!    gone even though the state file lingers.
//! 4. Best-effort remove `accounts.lock`. Never errors up (see Codex v3
//!    review Finding 4: the lock file is a coordination artifact, not
//!    user data, and a Windows file-handle delay should not surface as a
//!    scary partial-failure warning).

use crate::keychain::KeychainManager;
use crate::state::AppState;

#[derive(Debug)]
pub struct CleanupResult {
    pub keychain_entries_removed: u32,
    pub keychain_entries_failed: Vec<KeychainFailure>,
    /// True if `accounts.json` was deleted (or did not exist to begin with).
    pub accounts_file_deleted: bool,
}

#[derive(Debug, Clone)]
pub struct KeychainFailure {
    pub account_id: String,
    pub service: String,
    pub reason: String,
}

#[derive(Debug)]
pub enum CleanupError {
    /// The account snapshot could not be read. No keychain or state
    /// mutations were attempted; the bridge is unchanged.
    SnapshotReadFailed(String),
    /// Keychain cleanup completed but `accounts.json` could not be
    /// deleted. The caller should decide how loud to be about this.
    /// Callers running from the extension surface it as an info line,
    /// not a blocker.
    AccountsFileDeleteFailed(String),
}

/// Run the full uninstall cleanup in the correct order.
pub fn run_full_cleanup(
    state: &AppState,
    keychain: &KeychainManager,
) -> Result<CleanupResult, CleanupError> {
    // Step 1: snapshot. If this fails we abort -- no metadata means we
    // cannot construct the keychain handles to delete.
    //
    // We use list_accounts_for_cleanup (not list_accounts) because the
    // normal read path silently repairs corrupt JSON by backing it up
    // and returning an empty map. For uninstall that would turn
    // "metadata unreadable" into "nothing to clean" and leak every
    // keychain entry the bridge ever created. The cleanup variant
    // refuses to repair and returns Err on parse failure instead.
    let accounts = state
        .list_accounts_for_cleanup()
        .map_err(CleanupError::SnapshotReadFailed)?;

    // Step 2: keychain. Each failure is recorded, none are fatal.
    let mut keychain_entries_removed: u32 = 0;
    let mut keychain_entries_failed: Vec<KeychainFailure> = Vec::new();
    for account in &accounts {
        let service = format!("InboxBridge:{}", account.id);
        let user = format!("{}:{}", account.host, account.port);
        match keychain.delete_password(&service, &user) {
            Ok(_) => keychain_entries_removed += 1,
            Err(e) => keychain_entries_failed.push(KeychainFailure {
                account_id: account.id.clone(),
                service,
                reason: e.to_string(),
            }),
        }
    }

    // Step 3: accounts.json. Hard failure here still returns Err *after*
    // the keychain work, so the caller knows credentials are gone.
    let accounts_file_deleted = state
        .delete_accounts_file_locked()
        .map_err(CleanupError::AccountsFileDeleteFailed)?;

    // Step 4: lock file. Best-effort, never surfaced.
    state.delete_lock_file_best_effort();

    Ok(CleanupResult {
        keychain_entries_removed,
        keychain_entries_failed,
        accounts_file_deleted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn test_dir() -> PathBuf {
        std::env::temp_dir().join(format!("inboxbridge_cleanup_test_{}", Uuid::new_v4()))
    }

    #[test]
    fn test_run_full_cleanup_on_empty_state_returns_ok() {
        // Fresh state dir, no accounts ever added. run_full_cleanup should
        // return zero counts and report accounts_file_deleted=true because
        // the end state ("file is absent") is already satisfied. Empty-
        // state runs should NOT surface a "state file stuck" warning in
        // the UI.
        let dir = test_dir();
        let state = AppState::new(Some(dir.clone()));
        let keychain = KeychainManager::new();

        let result = run_full_cleanup(&state, &keychain).expect("empty state should succeed");
        assert_eq!(result.keychain_entries_removed, 0);
        assert!(result.keychain_entries_failed.is_empty());
        assert!(
            result.accounts_file_deleted,
            "empty state should report success: end state 'file absent' is achieved"
        );

        // Cleanup
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_run_full_cleanup_aborts_on_corrupt_state_file() {
        // Corrupt accounts.json must abort with SnapshotReadFailed instead
        // of silently reporting a zero-count success. The happy-path
        // read_accounts would repair the file and return an empty map,
        // which would orphan every keychain entry. The cleanup path must
        // refuse.
        let dir = test_dir();
        let state = AppState::new(Some(dir.clone()));
        let keychain = KeychainManager::new();

        // Seed corrupt content.
        let data_path = dir.join("accounts.json");
        std::fs::write(&data_path, b"{not valid json").unwrap();

        let err = run_full_cleanup(&state, &keychain).unwrap_err();
        match err {
            CleanupError::SnapshotReadFailed(msg) => {
                assert!(
                    msg.contains("corrupt"),
                    "expected corruption error, got: {}",
                    msg
                );
            }
            other => panic!("expected SnapshotReadFailed, got {:?}", other),
        }

        // The corrupt file MUST still be present on disk -- aborting
        // means no mutations at all, including the state delete.
        assert!(
            data_path.exists(),
            "cleanup abort must not touch the corrupt file"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    // NOTE: Keychain interaction tests are intentionally skipped here.
    // They would write real entries into the test runner's OS keychain,
    // which would pollute the developer machine and cannot be cleanly
    // mocked without introducing a trait abstraction. The existing bridge
    // tests in keychain.rs cover the underlying keyring crate behavior;
    // this module only composes state + keychain and is covered by the
    // empty-state test plus manual integration testing of the
    // `bridge.uninstall` RPC end-to-end.
}
