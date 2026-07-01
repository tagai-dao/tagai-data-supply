from tagai_data_supply.client.protocol import (
    PROTOCOL_VERSION, Hello, AuthAck, MessageType, CookieStatus, RegisterRequest,
)


def test_protocol_version():
    assert PROTOCOL_VERSION == "1"


def test_hello_serializes():
    h = Hello(node_token="tok", protocol_version="1", timezone="UTC", cookie_status=CookieStatus.OK)
    d = h.model_dump()
    assert d["type"] == "hello"
    assert d["node_token"] == "tok"
    assert d["cookie_status"] == "ok"


def test_auth_ack_ok():
    ack = AuthAck(ok=True, node_id="n1", protocol_version="1")
    assert ack.ok is True


def test_auth_ack_fail_with_error():
    ack = AuthAck(ok=False, error="protocol mismatch")
    assert ack.ok is False
    assert ack.error == "protocol mismatch"


def test_message_type_enum_complete():
    types = {t.value for t in MessageType}
    assert types == {
        "hello", "auth_ack", "heartbeat", "ping", "pong",
        "task_assign", "task_cancel", "task_result", "task_decline",
        "cookie_status", "unregister",
    }
