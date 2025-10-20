use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct Request {
    pub v: u8,
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Serialize, Debug)]
pub struct Response<T> {
    pub v: u8,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Serialize, Debug)]
pub struct RpcError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
pub struct Event {
    pub v: u8,
    pub event: String,
    pub data: serde_json::Value,
}

// Method-specific response types
#[derive(Serialize, Debug)]
pub struct PingResult {
    pub ok: bool,
    pub version: String,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u8,
    #[serde(rename = "minProtocolVersion")]
    pub min_protocol_version: u8,
    pub features: serde_json::Value,
}
