"""Relayer 注册 HTTP 调用（与 CLI / setup 向导共享，避免循环 import）。"""
from __future__ import annotations
import json
import urllib.error
import urllib.request

import click

from .client.protocol import PROTOCOL_VERSION, RegisterRequest, RegisterResponse


def local_timezone() -> str:
    try:
        import time
        local = time.localtime().tm_zone
        return local if local else "UTC"
    except Exception:
        return "UTC"


def register_with_relayer(http_base: str, invite_secret: str, timezone: str,
                          label: str | None = None,
                          tagai_username: str | None = None,
                          tagai_account_type: int | None = None) -> dict:
    """调用 relayer POST /node/register。收益账号传 tagai_username。"""
    req_body = RegisterRequest(
        invite_secret=invite_secret,
        protocol_version=PROTOCOL_VERSION,
        timezone=timezone,
        label=label,
        tagai_username=tagai_username,
        tagai_account_type=tagai_account_type,
    ).model_dump(exclude_none=True)
    url = http_base.rstrip("/") + "/node/register"
    data = json.dumps(req_body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise click.ClickException(f"register failed: HTTP {e.code} {detail}")
    parsed = RegisterResponse.model_validate(body)
    if parsed.c != 0 or not parsed.d:
        raise click.ClickException(f"register failed: {parsed.m}")
    return parsed.d
