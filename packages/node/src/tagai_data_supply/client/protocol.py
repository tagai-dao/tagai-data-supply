"""WS/REST 协议消息模型（与 shared JSON Schema 对齐）。spec §6。"""
from __future__ import annotations
from enum import Enum
from typing import Any, Optional, Literal
from pydantic import BaseModel, Field


PROTOCOL_VERSION = "1"


class MessageType(str, Enum):
    HELLO = "hello"
    AUTH_ACK = "auth_ack"
    HEARTBEAT = "heartbeat"
    PING = "ping"
    PONG = "pong"
    TASK_ASSIGN = "task_assign"
    TASK_CANCEL = "task_cancel"
    TASK_RESULT = "task_result"
    TASK_DECLINE = "task_decline"
    COOKIE_STATUS = "cookie_status"
    UNREGISTER = "unregister"


class CookieStatus(str, Enum):
    OK = "ok"
    RATE_LIMITED = "rate_limited"
    AUTH_FAILED = "auth_failed"
    ERROR = "error"
    UNKNOWN = "unknown"


class Hello(BaseModel):
    type: Literal["hello"] = "hello"
    node_token: str
    protocol_version: str
    timezone: str
    cookie_status: CookieStatus = CookieStatus.UNKNOWN
    label: Optional[str] = None


class AuthAck(BaseModel):
    type: Literal["auth_ack"] = "auth_ack"
    ok: bool = True
    node_id: Optional[str] = None
    protocol_version: Optional[str] = None
    error: Optional[str] = None


class RegisterRequest(BaseModel):
    invite_secret: str
    protocol_version: str
    timezone: str
    label: Optional[str] = None
    tagai_username: Optional[str] = None
    tagai_account_type: Optional[int] = None


class RegisterResponse(BaseModel):
    c: int
    d: Optional[dict] = None
    m: Optional[str] = None
