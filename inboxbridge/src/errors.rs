use thiserror::Error;

#[derive(Error, Debug)]
pub enum BridgeError {
    #[error("Invalid JSON in request: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unknown method: {0}")]
    MethodNotFound(String),

    #[error("Invalid parameters: {0}")]
    InvalidParams(String),

    #[error("Keychain unavailable: {0}")]
    KeychainUnavailable(String),

    #[error("IMAP authentication failed: {0}")]
    ImapAuth(String),

    #[error("IMAP network error: {0}")]
    ImapNetwork(String),
}

impl BridgeError {
    pub fn to_error_code(&self) -> &'static str {
        match self {
            BridgeError::InvalidJson(_) => "INVALID_JSON",
            BridgeError::Io(_) => "IO_ERROR",
            BridgeError::MethodNotFound(_) => "METHOD_NOT_FOUND",
            BridgeError::InvalidParams(_) => "INVALID_PARAMS",
            BridgeError::KeychainUnavailable(_) => "KEYCHAIN_UNAVAILABLE",
            BridgeError::ImapAuth(_) => "IMAP_AUTH",
            BridgeError::ImapNetwork(_) => "IMAP_NETWORK",
        }
    }
}
