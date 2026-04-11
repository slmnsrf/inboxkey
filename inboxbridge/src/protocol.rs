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
    /// Where the bridge binary lives and how to uninstall it.
    /// Optional so older extensions ignore the field and newer extensions
    /// gracefully degrade when the bridge doesn't know (future-proofing).
    #[serde(rename = "installInfo", skip_serializing_if = "Option::is_none")]
    pub install_info: Option<InstallInfo>,
}

#[derive(Serialize, Debug, Clone)]
pub struct InstallInfo {
    /// Absolute, canonicalized path to the running executable.
    #[serde(rename = "executablePath")]
    pub executable_path: String,
    /// How the install is laid out on disk, drives the UI verb
    /// ("delete this file" vs "delete this folder" vs "drag to Trash").
    pub kind: InstallKind,
    /// The file or directory the user should remove to complete uninstall.
    #[serde(rename = "uninstallTarget")]
    pub uninstall_target: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "kebab-case")]
pub enum InstallKind {
    /// A standalone binary, typical of macOS pkg (/usr/local/bin/...)
    /// or a portable Linux drop. UI: "delete this file".
    SingleBinary,
    /// A directory containing the binary and sidecar files such as a
    /// co-located Chrome native-messaging manifest. Typical of the Windows
    /// Inno Setup installer and the Windows portable install.ps1. UI:
    /// "delete this folder".
    Directory,
    /// A macOS .app bundle enclosing the executable under Contents/MacOS/.
    /// UI: "drag this app to the Trash".
    AppBundle,
}
