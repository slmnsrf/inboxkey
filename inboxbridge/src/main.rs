mod protocol;
mod dispatcher;
mod keychain;
mod state;
mod imap_client;
mod cleanup;
mod install_info;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use protocol::{Request, Response};
use serde_json::Value;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    // --cleanup: shared with bridge.uninstall RPC via cleanup::run_full_cleanup.
    // Used by installer uninstall scripts (Windows Inno Setup [UninstallRun],
    // macOS postremove, manual operator runs).
    //
    // Exit codes:
    //   0 = cleanup completed (keychain wipe attempted for every account and
    //       accounts.json is gone). Per-account keychain failures are logged
    //       to stderr but do not change the exit code because they are
    //       individually recoverable by the user later.
    //   2 = snapshot read failed -- cleanup did not run at all.
    //   3 = keychain wipe finished but accounts.json could not be deleted.
    //
    // stderr is operator-facing and intentionally English-only.
    if std::env::args().any(|a| a == "--cleanup") {
        let state = state::AppState::new(None);
        let keychain = keychain::KeychainManager::new();

        match cleanup::run_full_cleanup(&state, &keychain) {
            Ok(result) => {
                eprintln!(
                    "InboxBridge cleanup: {} keychain entries removed, {} failed, accounts.json deleted: {}",
                    result.keychain_entries_removed,
                    result.keychain_entries_failed.len(),
                    result.accounts_file_deleted,
                );
                for failure in &result.keychain_entries_failed {
                    eprintln!(
                        "  failed: accountId={} service={} reason={}",
                        failure.account_id, failure.service, failure.reason
                    );
                }
                std::process::exit(0);
            }
            Err(cleanup::CleanupError::SnapshotReadFailed(msg)) => {
                eprintln!(
                    "InboxBridge cleanup FAILED: could not read account list: {}",
                    msg
                );
                std::process::exit(2);
            }
            Err(cleanup::CleanupError::AccountsFileDeleteFailed(msg)) => {
                eprintln!(
                    "InboxBridge cleanup partially completed: keychain cleared, but accounts.json could not be deleted: {}",
                    msg
                );
                std::process::exit(3);
            }
        }
    }

    if let Err(e) = run_async().await {
        eprintln!("InboxBridge error: {}", e);
        std::process::exit(1);
    }
}

async fn run_async() -> anyhow::Result<()> {
    let state = Arc::new(state::AppState::new(None));
    let keychain = Arc::new(keychain::KeychainManager::new());

    let mut stdin = tokio::io::stdin();

    // Writer task owns stdout. Each dispatch task sends its response through
    // this channel; the writer serializes them on the wire so the binary
    // length-prefixed protocol stays well-formed under concurrent dispatch.
    //
    // Capacity 64 bounds the response-queue depth (completed responses
    // waiting for stdout). It does NOT bound in-flight dispatch concurrency,
    // which is intentionally unbounded for a single-user native-messaging
    // host where the extension fans out at most a few requests at a time.
    let (tx, mut rx) = mpsc::channel::<Response<Value>>(64);
    tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(response) = rx.recv().await {
            let body = match serde_json::to_vec(&response) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("InboxBridge: response serialize failed: {}", e);
                    continue;
                }
            };
            let len_bytes = (body.len() as u32).to_le_bytes();
            if stdout.write_all(&len_bytes).await.is_err()
                || stdout.write_all(&body).await.is_err()
                || stdout.flush().await.is_err()
            {
                // Stdout is gone -- Chrome closed the native-messaging port.
                // Exit immediately so we don't keep accepting requests we
                // can't answer. Mirrors stdin-EOF handling on the read side.
                eprintln!("InboxBridge: stdout write failed; exiting");
                std::process::exit(0);
            }
        }
    });

    loop {
        // Read 4-byte length prefix.
        // Stdin EOF here means Chrome closed the native-messaging port; exit hard
        // so we can never become a zombie holding the port handle open.
        let mut len_bytes = [0u8; 4];
        if stdin.read_exact(&mut len_bytes).await.is_err() {
            std::process::exit(0);
        }

        let len = u32::from_le_bytes(len_bytes) as usize;
        if len > 1_000_000 {
            // Message too large (1MB limit)
            return Err(anyhow::anyhow!("Message exceeds 1MB limit"));
        }

        // Read JSON payload. EOF mid-message is also a port disconnect; exit hard.
        let mut buf = vec![0u8; len];
        if stdin.read_exact(&mut buf).await.is_err() {
            std::process::exit(0);
        }

        // Spawn each dispatch as its own task so the read loop can immediately
        // accept the next request. Dispatches run concurrently; responses arrive
        // at the writer in completion order, not request order. The extension
        // matches responses by request id, so out-of-order is fine.
        let state = state.clone();
        let keychain = keychain.clone();
        let tx = tx.clone();
        tokio::spawn(async move {
            let response = match serde_json::from_slice::<Request>(&buf) {
                Ok(request) => {
                    // 60s upper bound on dispatch. The extension times out
                    // pending requests at 30s; on bridge timeout we drop the
                    // response so we don't race the extension with a stale
                    // reply (which would surface as "unknown request id").
                    match timeout(
                        Duration::from_secs(60),
                        dispatcher::dispatch(request, state, keychain),
                    )
                    .await
                    {
                        Ok(response) => response,
                        Err(_) => {
                            eprintln!("InboxBridge: dispatch timed out after 60s");
                            return;
                        }
                    }
                }
                Err(e) => Response {
                    v: 1,
                    id: "unknown".to_string(),
                    result: None,
                    error: Some(protocol::RpcError {
                        code: "INVALID_JSON".to_string(),
                        message: format!("Invalid JSON: {}", e),
                        details: None,
                    }),
                },
            };
            let _ = tx.send(response).await;
        });
    }

    // Loop only exits via std::process::exit on stdin EOF or via Err propagation;
    // reaching here would mean a logic bug above.
    #[allow(unreachable_code)]
    Ok(())
}
