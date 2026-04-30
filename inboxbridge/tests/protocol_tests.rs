use serde_json::json;

#[test]
fn test_ping_request_parsing() {
    let request_json = json!({
        "v": 1,
        "id": "test-123",
        "method": "bridge.ping",
        "params": {}
    });

    let request: inboxbridge::protocol::Request =
        serde_json::from_value(request_json).unwrap();

    assert_eq!(request.v, 1);
    assert_eq!(request.id, "test-123");
    assert_eq!(request.method, "bridge.ping");
}

#[test]
fn test_ping_response_serialization() {
    let response = inboxbridge::protocol::Response {
        v: 1,
        id: "test-123".to_string(),
        result: Some(json!({
            "ok": true,
            "version": "1.0.0",
            "protocolVersion": 1,
            "minProtocolVersion": 1
        })),
        error: None,
    };

    let json = serde_json::to_value(&response).unwrap();
    assert_eq!(json["v"], 1);
    assert_eq!(json["id"], "test-123");
    assert!(json["result"]["ok"].as_bool().unwrap());
}

#[test]
fn test_error_response_serialization() {
    let response: inboxbridge::protocol::Response<serde_json::Value> = inboxbridge::protocol::Response {
        v: 1,
        id: "test-456".to_string(),
        result: None,
        error: Some(inboxbridge::protocol::RpcError {
            code: "METHOD_NOT_FOUND".to_string(),
            message: "Unknown method: test.unknown".to_string(),
            details: None,
        }),
    };

    let json = serde_json::to_value(&response).unwrap();
    assert_eq!(json["v"], 1);
    assert_eq!(json["id"], "test-456");
    assert_eq!(json["error"]["code"], "METHOD_NOT_FOUND");
    assert!(json["result"].is_null());
}
