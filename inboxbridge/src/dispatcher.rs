use crate::protocol::{Request, Response, RpcError, PingResult};
use crate::state::{Account, AppState};
use crate::keychain::KeychainManager;
use crate::imap_client::ImapClient;
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

pub async fn dispatch(
    request: Request,
    state: Arc<AppState>,
    keychain: Arc<KeychainManager>,
) -> Response<Value> {
    let id = request.id.clone();

    match request.method.as_str() {
        "bridge.ping" => handle_ping(id),
        "installStatus.get" => handle_install_status(id),
        "account.add" => handle_account_add(id, request.params, state, keychain).await,
        "account.remove" => handle_account_remove(id, request.params, state, keychain).await,
        "account.test" => handle_account_test(id, request.params).await,
        "mail.fetchRecent" => handle_mail_fetch_recent(id, request.params, state, keychain).await,
        "watch.start" => error_response(id, "UNIMPLEMENTED", "watch.start is not yet implemented. Use manual sync via mail.fetchRecent."),
        "watch.stop" => error_response(id, "UNIMPLEMENTED", "watch.stop is not yet implemented."),
        _ => Response {
            v: 1,
            id,
            result: None,
            error: Some(RpcError {
                code: "METHOD_NOT_FOUND".to_string(),
                message: format!("Unknown method: {}", request.method),
                details: None,
            }),
        },
    }
}

fn handle_ping(id: String) -> Response<Value> {
    let result = PingResult {
        ok: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
        protocol_version: 1,
        min_protocol_version: 1,
        features: serde_json::json!({
            "idle": false,
            "tls13": true
        }),
    };

    Response {
        v: 1,
        id,
        result: Some(serde_json::to_value(result).unwrap()),
        error: None,
    }
}

fn handle_install_status(id: String) -> Response<Value> {
    let keychain = detect_keychain();

    Response {
        v: 1,
        id,
        result: Some(serde_json::json!({
            "installed": true,
            "version": env!("CARGO_PKG_VERSION"),
            "keychain": keychain
        })),
        error: None,
    }
}

fn detect_keychain() -> &'static str {
    #[cfg(target_os = "macos")]
    return "macos";

    #[cfg(target_os = "windows")]
    return "windows";

    #[cfg(target_os = "linux")]
    {
        // Check if Secret Service is available
        // For now, just return "secret-service" (Phase 2 will implement proper detection)
        "secret-service"
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unavailable";
}

fn error_response(id: String, code: &str, message: &str) -> Response<Value> {
    Response {
        v: 1,
        id,
        result: None,
        error: Some(RpcError {
            code: code.to_string(),
            message: message.to_string(),
            details: None,
        }),
    }
}

/// Returns true when the host resolves to a loopback address.
/// Plaintext IMAP (tls=false) sends credentials in cleartext, so it must
/// only be allowed for local bridges (e.g. ProtonMail Bridge on 127.0.0.1).
fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "::1" | "localhost")
}

/// Enforces the security policy: plaintext connections are restricted to
/// loopback addresses only. Returns an (error_code, message) tuple on
/// violation so the caller can build the RPC error.
fn validate_tls_policy(host: &str, tls: bool) -> Result<(), (&'static str, &'static str)> {
    if !tls && !is_loopback_host(host) {
        return Err((
            "INVALID_PARAMS",
            "Plaintext connections are only allowed to localhost/127.0.0.1 (local bridges). \
             Enable TLS for remote servers.",
        ));
    }
    Ok(())
}

async fn handle_account_add(
    id: String,
    params: Value,
    state: Arc<AppState>,
    keychain: Arc<KeychainManager>,
) -> Response<Value> {
    // Parse params
    let label = params["label"].as_str().unwrap_or("Untitled");
    let host = params["host"].as_str().unwrap_or_default();
    let port = params["port"].as_u64().unwrap_or(993) as u16;
    let username = params["username"].as_str().unwrap_or_default();
    let password = params["password"].as_str().unwrap_or_default();
    let tls = params["tls"].as_bool().unwrap_or(true);

    if host.is_empty() || username.is_empty() || password.is_empty() {
        return error_response(id, "INVALID_PARAMS", "Missing required parameters: host, username, or password");
    }

    // Loopback guard: plaintext only allowed on localhost
    if let Err((code, msg)) = validate_tls_policy(host, tls) {
        return error_response(id, code, msg);
    }

    // Store password in keychain
    let service = format!("InboxBridge:{}", username);
    if let Err(e) = keychain.store_password(&service, host, password) {
        return error_response(id, "KEYCHAIN_UNAVAILABLE", &format!("Failed to store password: {}", e));
    }

    // Create account
    let account_id = format!("acc_{}", Uuid::new_v4().to_string().replace("-", "").chars().take(8).collect::<String>());
    let account = Account {
        id: account_id.clone(),
        label: label.to_string(),
        host: host.to_string(),
        port,
        tls,
        username: username.to_string(),
    };

    match state.add_account(account) {
        Ok(_) => Response {
            v: 1,
            id,
            result: Some(json!({"accountId": account_id})),
            error: None,
        },
        Err(e) => error_response(id, "STORAGE_ERROR", &e),
    }
}

async fn handle_account_remove(
    id: String,
    params: Value,
    state: Arc<AppState>,
    keychain: Arc<KeychainManager>,
) -> Response<Value> {
    let account_id = match params["accountId"].as_str() {
        Some(id) => id,
        None => return error_response(id, "INVALID_PARAMS", "Missing accountId parameter"),
    };

    // Get account to retrieve username for keychain deletion
    let account = match state.get_account(account_id) {
        Ok(Some(acct)) => acct,
        Ok(None) => return error_response(id, "ACCOUNT_NOT_FOUND", &format!("Account {} not found", account_id)),
        Err(e) => return error_response(id, "STORAGE_ERROR", &e),
    };

    // Delete password from keychain
    let service = format!("InboxBridge:{}", account.username);
    if let Err(e) = keychain.delete_password(&service, &account.host) {
        eprintln!("Warning: Failed to delete password from keychain: {}", e);
        // Continue anyway - don't fail the whole operation
    }

    // Remove account from state
    match state.remove_account(account_id) {
        Ok(_) => Response {
            v: 1,
            id,
            result: Some(json!({"success": true})),
            error: None,
        },
        Err(e) => error_response(id, "STORAGE_ERROR", &e),
    }
}

async fn handle_account_test(
    id: String,
    params: Value,
) -> Response<Value> {
    let host = params["host"].as_str().unwrap_or_default();
    let port = params["port"].as_u64().unwrap_or(993) as u16;
    let username = params["username"].as_str().unwrap_or_default();
    let password = params["password"].as_str().unwrap_or_default();
    let tls = params["tls"].as_bool().unwrap_or(true);

    if host.is_empty() || username.is_empty() || password.is_empty() {
        return error_response(id, "INVALID_PARAMS", "Missing required parameters: host, username, or password");
    }

    // Loopback guard: plaintext only allowed on localhost
    if let Err((code, msg)) = validate_tls_policy(host, tls) {
        return error_response(id, code, msg);
    }

    let mut client = ImapClient::new();

    // Attempt connection
    match client.connect(host, port, username, password, tls).await {
        Ok(_) => {
            // Test round-trip time
            let (success, round_trip_ms) = match client.test_connection().await {
                Ok(result) => result,
                Err(e) => {
                    let _ = client.disconnect().await;
                    return error_response(id, "IMAP_NETWORK", &format!("Connection test failed: {}", e));
                }
            };

            let _ = client.disconnect().await;

            Response {
                v: 1,
                id,
                result: Some(json!({
                    "success": success,
                    "capabilities": {
                        "idle": false
                    },
                    "roundTripMs": round_trip_ms.unwrap_or(0)
                })),
                error: None,
            }
        }
        Err(e) => {
            let error_msg = e.to_string();
            let error_code = if error_msg.contains("authentication") || error_msg.contains("login") {
                "IMAP_AUTH"
            } else if error_msg.contains("TLS") || error_msg.contains("handshake") {
                "TLS_HANDSHAKE"
            } else {
                "IMAP_NETWORK"
            };

            error_response(id, error_code, &error_msg)
        }
    }
}

async fn handle_mail_fetch_recent(
    id: String,
    params: Value,
    state: Arc<AppState>,
    keychain: Arc<KeychainManager>,
) -> Response<Value> {
    let account_id = match params["accountId"].as_str() {
        Some(id) => id,
        None => return error_response(id, "INVALID_PARAMS", "Missing accountId parameter"),
    };

    let since_minutes = params["sinceMinutes"].as_u64().unwrap_or(10) as u32;
    let limit = params["limit"].as_u64().unwrap_or(15) as usize;

    // Get account
    let account = match state.get_account(account_id) {
        Ok(Some(acct)) => acct,
        Ok(None) => return error_response(id, "ACCOUNT_NOT_FOUND", &format!("Account {} not found", account_id)),
        Err(e) => return error_response(id, "STORAGE_ERROR", &e),
    };

    // Defense in depth: re-validate TLS policy in case accounts.json was hand-edited
    if let Err((code, msg)) = validate_tls_policy(&account.host, account.tls) {
        return error_response(id, code, msg);
    }

    // Get password from keychain
    let service = format!("InboxBridge:{}", account.username);
    let password = match keychain.get_password(&service, &account.host) {
        Ok(pwd) => pwd,
        Err(e) => return error_response(id, "KEYCHAIN_UNAVAILABLE", &format!("Failed to retrieve password: {}", e)),
    };

    // Connect to IMAP
    let mut client = ImapClient::new();
    if let Err(e) = client.connect(&account.host, account.port, &account.username, &password, account.tls).await {
        let error_msg = e.to_string();
        let error_code = if error_msg.contains("authentication") || error_msg.contains("login") {
            "IMAP_AUTH"
        } else if error_msg.contains("TLS") {
            "TLS_HANDSHAKE"
        } else {
            "IMAP_NETWORK"
        };
        return error_response(id, error_code, &error_msg);
    }

    // Fetch recent messages
    let messages = match client.list_recent(since_minutes, limit).await {
        Ok(msgs) => msgs,
        Err(e) => {
            let _ = client.disconnect().await;
            return error_response(id, "IMAP_NETWORK", &format!("Failed to fetch messages: {}", e));
        }
    };

    let _ = client.disconnect().await;

    Response {
        v: 1,
        id,
        result: Some(json!({"messages": messages})),
        error: None,
    }
}
