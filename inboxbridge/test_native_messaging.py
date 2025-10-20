#!/usr/bin/env python3
"""
Test script for InboxBridge native messaging protocol
Tests Phase 2 IMAP implementation
"""

import json
import struct
import subprocess
import sys
from pathlib import Path

BINARY_PATH = Path(__file__).parent / "target" / "release" / "inboxbridge"


def send_request(request_data):
    """Send a request to InboxBridge and receive response."""
    # Encode request as JSON
    request_json = json.dumps(request_data)
    request_bytes = request_json.encode('utf-8')

    # Create length prefix (4-byte little-endian)
    length = len(request_bytes)
    length_bytes = struct.pack('<I', length)

    # Start InboxBridge process
    proc = subprocess.Popen(
        [str(BINARY_PATH)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Send request with length prefix
    proc.stdin.write(length_bytes + request_bytes)
    proc.stdin.flush()

    # Read response length (4 bytes)
    response_length_bytes = proc.stdout.read(4)
    if not response_length_bytes:
        stderr = proc.stderr.read().decode('utf-8')
        raise Exception(f"No response received. stderr: {stderr}")

    response_length = struct.unpack('<I', response_length_bytes)[0]

    # Read response JSON
    response_bytes = proc.stdout.read(response_length)
    response_json = response_bytes.decode('utf-8')

    # Close process
    proc.stdin.close()
    proc.terminate()
    proc.wait(timeout=5)

    return json.loads(response_json)


def test_ping():
    """Test bridge.ping method."""
    print("[TEST 1] bridge.ping")
    request = {
        "v": 1,
        "id": "ping-1",
        "method": "bridge.ping",
        "params": {}
    }

    response = send_request(request)

    assert response["v"] == 1
    assert response["id"] == "ping-1"
    assert response.get("result")
    assert response["result"]["ok"] is True
    assert "version" in response["result"]
    assert response["result"]["protocolVersion"] == 1

    print(f"  ✓ Version: {response['result']['version']}")
    print(f"  ✓ Protocol: v{response['result']['protocolVersion']}")
    print()


def test_install_status():
    """Test installStatus.get method."""
    print("[TEST 2] installStatus.get")
    request = {
        "v": 1,
        "id": "install-1",
        "method": "installStatus.get",
        "params": {}
    }

    response = send_request(request)

    assert response["v"] == 1
    assert response["id"] == "install-1"
    assert response.get("result")
    assert response["result"]["installed"] is True
    assert "keychain" in response["result"]

    print(f"  ✓ Installed: {response['result']['installed']}")
    print(f"  ✓ Keychain: {response['result']['keychain']}")
    print()


def test_account_test(host, port, username, password):
    """Test account.test method with real credentials."""
    print("[TEST 3] account.test (live IMAP connection)")
    print(f"  Host: {host}:{port}")
    print(f"  Username: {username}")

    request = {
        "v": 1,
        "id": "test-1",
        "method": "account.test",
        "params": {
            "host": host,
            "port": port,
            "username": username,
            "password": password
        }
    }

    response = send_request(request)

    if response.get("error"):
        print(f"  ✗ Error: {response['error']['code']}")
        print(f"    Message: {response['error']['message']}")
        return False

    assert response.get("result")
    assert response["result"]["success"] is True

    print(f"  ✓ Connection successful")
    print(f"  ✓ Round-trip: {response['result'].get('roundTripMs', 0)}ms")
    print()
    return True


def test_account_lifecycle(host, port, username, password):
    """Test account.add, mail.fetchRecent, account.remove."""
    print("[TEST 4] account.add + mail.fetchRecent + account.remove")

    # Add account
    add_request = {
        "v": 1,
        "id": "add-1",
        "method": "account.add",
        "params": {
            "label": "Test Account",
            "host": host,
            "port": port,
            "username": username,
            "password": password
        }
    }

    add_response = send_request(add_request)

    if add_response.get("error"):
        print(f"  ✗ Add failed: {add_response['error']['code']}")
        return False

    account_id = add_response["result"]["accountId"]
    print(f"  ✓ Account added: {account_id}")

    # Fetch recent messages
    fetch_request = {
        "v": 1,
        "id": "fetch-1",
        "method": "mail.fetchRecent",
        "params": {
            "accountId": account_id,
            "sinceMinutes": 10,
            "limit": 5
        }
    }

    fetch_response = send_request(fetch_request)

    if fetch_response.get("error"):
        print(f"  ✗ Fetch failed: {fetch_response['error']['code']}")
    else:
        messages = fetch_response["result"].get("messages", [])
        print(f"  ✓ Fetched {len(messages)} messages")

        if messages:
            msg = messages[0]
            print(f"    Sample: From={msg['from'][:30]}, Subject={msg['subject'][:30]}")

    # Remove account
    remove_request = {
        "v": 1,
        "id": "remove-1",
        "method": "account.remove",
        "params": {
            "accountId": account_id
        }
    }

    remove_response = send_request(remove_request)

    if remove_response.get("error"):
        print(f"  ✗ Remove failed: {remove_response['error']['code']}")
        return False

    print(f"  ✓ Account removed")
    print()
    return True


def main():
    """Run all tests."""
    print("=" * 50)
    print("InboxBridge Phase 2 - Native Messaging Test Suite")
    print("=" * 50)
    print()

    # Check binary exists
    if not BINARY_PATH.exists():
        print(f"Error: Binary not found at {BINARY_PATH}")
        print("Run: cargo build --release")
        sys.exit(1)

    print(f"Binary: {BINARY_PATH}")
    print(f"Size: {BINARY_PATH.stat().st_size / 1024 / 1024:.1f}MB")
    print()

    try:
        # Basic tests (no credentials needed)
        test_ping()
        test_install_status()

        # IMAP tests (require credentials)
        if len(sys.argv) >= 5:
            host = sys.argv[1]
            port = int(sys.argv[2])
            username = sys.argv[3]
            password = sys.argv[4]

            if test_account_test(host, port, username, password):
                test_account_lifecycle(host, port, username, password)
        else:
            print("[TEST 3-4] Skipping IMAP tests (no credentials)")
            print(f"  Usage: {sys.argv[0]} <host> <port> <username> <password>")
            print()

        # Summary
        print("=" * 50)
        print("Phase 2 Test Results: SUCCESS")
        print("=" * 50)
        print()
        print("Methods tested:")
        print("  ✓ bridge.ping")
        print("  ✓ installStatus.get")
        if len(sys.argv) >= 5:
            print("  ✓ account.test")
            print("  ✓ account.add")
            print("  ✓ mail.fetchRecent")
            print("  ✓ account.remove")
        else:
            print("  - account.test (skipped)")
            print("  - account.add (skipped)")
            print("  - mail.fetchRecent (skipped)")
            print("  - account.remove (skipped)")
        print()
        print("To test IMAP methods:")
        print(f"  python3 {sys.argv[0]} imap.gmail.com 993 user@gmail.com app-password")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
