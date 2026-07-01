"""WS 客户端：连接、鉴权、心跳、断线重连。spec §6 / §8.5。"""
from __future__ import annotations
import asyncio
import json
import random
import logging
from typing import Optional, Callable, Awaitable

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:  # websockets 可选（测试可 mock）
    websockets = None
    ConnectionClosed = Exception

from .protocol import (
    PROTOCOL_VERSION, Hello, AuthAck, MessageType, CookieStatus,
)

logger = logging.getLogger(__name__)


class NodeClient:
    """常驻 WS 客户端，自动重连（带 jitter 指数退避，spec §8.5）。"""

    # 重连参数
    BACKOFF_BASE = 1.0
    BACKOFF_MAX = 60.0
    BACKOFF_JITTER = 0.3
    HEARTBEAT_INTERVAL = 30.0

    def __init__(
        self,
        relayer_url: str,
        node_token: str,
        timezone: str = "UTC",
        cookie_status: CookieStatus = CookieStatus.UNKNOWN,
        on_task: Optional[Callable[[dict], Awaitable[dict]]] = None,
        ws_factory: Optional[Callable[[str], Awaitable[Any]]] = None,
        on_auth_change: Optional[Callable[[bool], None]] = None,
    ):
        self.relayer_url = relayer_url
        self.node_token = node_token
        self.timezone = timezone
        self.cookie_status = cookie_status
        self.on_task = on_task
        # ws_factory 注入便于测试；默认用 websockets.connect
        self._ws_factory = ws_factory
        self._on_auth_change = on_auth_change
        self._stop = asyncio.Event()
        self.authed = False

    async def run(self) -> None:
        """主循环：连接 → 鉴权 → 心跳/收消息，断线后重连。"""
        attempt = 0
        while not self._stop.is_set():
            try:
                await self._connect_and_serve()
                attempt = 0  # 成功过则重置退避
            except Exception as e:
                logger.warning("ws disconnected: %s", e)
            if self._stop.is_set():
                break
            attempt += 1
            delay = self._backoff(attempt)
            logger.info("reconnect in %.1fs (attempt %d)", delay, attempt)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    def _backoff(self, attempt: int) -> float:
        delay = min(self.BACKOFF_MAX, self.BACKOFF_BASE * (2 ** (attempt - 1)))
        jitter = delay * self.BACKOFF_JITTER * (random.random() * 2 - 1)
        return min(self.BACKOFF_MAX, max(0.5, delay + jitter))

    async def _connect_and_serve(self) -> None:
        if self._ws_factory is not None:
            ws = await self._ws_factory(self.relayer_url)
        else:
            if websockets is None:
                raise RuntimeError("websockets not installed")
            # proxy=None 禁用系统代理（macOS 下会读到 SOCKS 代理导致连接失败）
            try:
                ws = await websockets.connect(self.relayer_url, max_size=None, proxy=None)
            except TypeError:  # 旧版 websockets 无 proxy 参数
                ws = await websockets.connect(self.relayer_url, max_size=None)
        try:
            await self._handshake(ws)
            await self._serve(ws)
        finally:
            self.authed = False
            if self._on_auth_change:
                self._on_auth_change(False)
            try:
                await ws.close()
            except Exception:
                pass

    async def _handshake(self, ws) -> None:
        hello = Hello(
            node_token=self.node_token,
            protocol_version=PROTOCOL_VERSION,
            timezone=self.timezone,
            cookie_status=self.cookie_status,
        )
        await ws.send(hello.model_dump_json())
        raw = await ws.recv()
        ack = AuthAck.model_validate_json(raw)
        if not ack.ok:
            raise ConnectionError(f"auth failed: {ack.error}")
        self.authed = True
        if self._on_auth_change:
            self._on_auth_change(True)
        logger.info("ws authed as node %s", ack.node_id)

    async def _serve(self, ws) -> None:
        """接收消息 + 定时心跳，直到连接断开。"""
        async def heartbeat():
            while not self._stop.is_set():
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)
                try:
                    await ws.send(json.dumps({
                        "type": MessageType.HEARTBEAT.value,
                        "cookie_status": self.cookie_status.value,
                    }))
                except Exception:
                    return

        hb_task = asyncio.create_task(heartbeat())
        try:
            async for raw in ws:
                await self._handle(ws, json.loads(raw))
        finally:
            hb_task.cancel()

    async def _handle(self, ws, msg: dict) -> None:
        t = msg.get("type")
        if t == MessageType.PING.value:
            await ws.send(json.dumps({"type": MessageType.PONG.value}))
        elif t == MessageType.TASK_ASSIGN.value and self.on_task:
            result = await self.on_task(msg)
            if result:
                await ws.send(json.dumps(result))
        elif t == MessageType.TASK_CANCEL.value:
            logger.info("task cancelled: %s", msg.get("subtask_id"))
        else:
            logger.debug("unhandled message: %s", t)

    def stop(self) -> None:
        self._stop.set()
