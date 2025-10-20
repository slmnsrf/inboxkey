mod protocol;
mod dispatcher;
mod errors;
mod keychain;
mod state;
mod imap_client;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use protocol::Request;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    if let Err(e) = run_async().await {
        eprintln!("InboxBridge error: {}", e);
        std::process::exit(1);
    }
}

async fn run_async() -> anyhow::Result<()> {
    let state = Arc::new(state::AppState::new());
    let keychain = Arc::new(keychain::KeychainManager::new());

    let mut stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();

    loop {
        // Read 4-byte length prefix
        let mut len_bytes = [0u8; 4];
        if stdin.read_exact(&mut len_bytes).await.is_err() {
            // Extension disconnected (normal exit)
            break;
        }

        let len = u32::from_le_bytes(len_bytes) as usize;
        if len > 1_000_000 {
            // Message too large (1MB limit)
            return Err(anyhow::anyhow!("Message exceeds 1MB limit"));
        }

        // Read JSON payload
        let mut buf = vec![0u8; len];
        stdin.read_exact(&mut buf).await?;

        // Parse and dispatch
        let response = match serde_json::from_slice::<Request>(&buf) {
            Ok(request) => dispatcher::dispatch(request, state.clone(), keychain.clone()).await,
            Err(e) => {
                protocol::Response {
                    v: 1,
                    id: "unknown".to_string(),
                    result: None,
                    error: Some(protocol::RpcError {
                        code: "INVALID_JSON".to_string(),
                        message: format!("Invalid JSON: {}", e),
                        details: None,
                    }),
                }
            }
        };

        // Write response
        let response_json = serde_json::to_vec(&response)?;
        let response_len = (response_json.len() as u32).to_le_bytes();
        stdout.write_all(&response_len).await?;
        stdout.write_all(&response_json).await?;
        stdout.flush().await?;
    }

    Ok(())
}
