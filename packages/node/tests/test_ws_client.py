import asyncio
import json
import pytest
from tagai_data_supply.client.ws import NodeClient
from tagai_data_supply.client.protocol import CookieStatus


class FakeWS:
    """模拟 websockets 连接：可注入入站消息队列，记录出站消息。"""

    def __init__(self, incoming: list[str]):
        self._in = list(incoming)
        self.sent: list[str] = []
        self._closed = False

    async def send(self, data: str):
        self.sent.append(data)

    async def recv(self) -> str:
        if not self._in:
            await asyncio.sleep(0.01)
            raise asyncio.TimeoutError("no more messages")
        return self._in.pop(0)

    def __aiter__(self):
        self._iter_in = list(self._in)
        return self

    async def __anext__(self):
        if self._iter_in:
            return self._iter_in.pop(0)
        # 让出控制权后停止迭代
        await asyncio.sleep(0.02)
        raise StopAsyncIteration

    async def close(self):
        self._closed = True


def _auth_ack() -> str:
    return json.dumps({"type": "auth_ack", "ok": True, "node_id": "n1", "protocol_version": "1"})


@pytest.mark.asyncio
async def test_handshake_sends_hello(monkeypatch):
    fake = FakeWS([_auth_ack()])
    client = NodeClient(
        relayer_url="ws://x", node_token="tok",
        timezone="UTC", cookie_status=CookieStatus.OK,
        tagai_username="alice",
        ws_factory=lambda url: asyncio.sleep(0, result=fake),
    )
    await client._handshake(fake)
    sent = json.loads(fake.sent[0])
    assert sent["type"] == "hello"
    assert sent["node_token"] == "tok"
    assert sent["tagai_username"] == "alice"
    assert sent["protocol_version"] == "1"
    assert client.authed is True


@pytest.mark.asyncio
async def test_ping_responds_with_pong(monkeypatch):
    fake = FakeWS([_auth_ack(), json.dumps({"type": "ping"})])
    client = NodeClient(
        relayer_url="ws://x", node_token="tok",
        timezone="UTC", cookie_status=CookieStatus.OK,
        ws_factory=lambda url: asyncio.sleep(0, result=fake),
    )
    # 加速心跳避免干扰
    client.HEARTBEAT_INTERVAL = 100

    async def stop_soon():
        await asyncio.sleep(0.2)
        client.stop()

    asyncio.create_task(stop_soon())
    await client.run()

    sent_types = [json.loads(s).get("type") for s in fake.sent]
    assert "hello" in sent_types
    assert "pong" in sent_types


@pytest.mark.asyncio
async def test_backoff_grows_and_caps():
    client = NodeClient(relayer_url="ws://x", node_token="tok")
    d1 = client._backoff(1)
    d3 = client._backoff(3)
    assert d1 >= 0.5
    assert d3 >= d1
    assert client._backoff(100) <= client.BACKOFF_MAX + 1


@pytest.mark.asyncio
async def test_task_declined_logs_reason_and_recover(caplog):
    import logging
    caplog.set_level(logging.INFO)

    class DeclineGate:
        def check_accept(self):
            return False, "min_interval", 125

        def set_busy(self, _busy):
            pass

    task_msg = json.dumps({
        "type": "task_assign", "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {},
    })
    fake = FakeWS([_auth_ack(), task_msg])

    async def should_not_run(msg):
        raise AssertionError("declined task should not run")

    client = NodeClient(
        relayer_url="ws://x", node_token="tok",
        timezone="UTC", cookie_status=CookieStatus.OK,
        on_task=should_not_run,
        task_gate=DeclineGate(),
        ws_factory=lambda url: asyncio.sleep(0, result=fake),
    )
    client.HEARTBEAT_INTERVAL = 100

    async def stop_soon():
        await asyncio.sleep(0.2)
        client.stop()

    asyncio.create_task(stop_soon())
    await client.run()

    declined = [r for r in caplog.records if "task declined" in r.message]
    assert len(declined) == 1
    assert "reason=min_interval" in declined[0].message
    assert "recover_in=2m5s" in declined[0].message
    sent = [json.loads(s) for s in fake.sent]
    assert any(m.get("type") == "task_decline" and m.get("reason") == "min_interval" for m in sent)


@pytest.mark.asyncio
async def test_task_handler_invoked(monkeypatch):
    task_msg = json.dumps({
        "type": "task_assign", "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {}, "mode": "continuous",
    })
    fake = FakeWS([_auth_ack(), task_msg])
    received: list[dict] = []

    async def on_task(msg):
        received.append(msg)
        return {"type": "task_result", "assignment_id": msg["assignment_id"], "subtask_id": msg["subtask_id"], "status": "done"}

    client = NodeClient(
        relayer_url="ws://x", node_token="tok",
        timezone="UTC", cookie_status=CookieStatus.OK,
        on_task=on_task,
        ws_factory=lambda url: asyncio.sleep(0, result=fake),
    )
    client.HEARTBEAT_INTERVAL = 100

    async def stop_soon():
        await asyncio.sleep(0.2)
        client.stop()

    asyncio.create_task(stop_soon())
    await client.run()

    assert len(received) == 1
    assert received[0]["subtask_id"] == "s1"
    sent_types = [json.loads(s).get("type") for s in fake.sent]
    assert "task_result" in sent_types
