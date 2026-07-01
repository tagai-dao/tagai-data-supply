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


def _friendly_verify_error(http_code: int, detail: str) -> str:
    """把 relayer/tagai-api 错误转成用户可读中文。"""
    low = detail.lower()
    if http_code == 403 or 'not verified' in low or 'steem' in low:
        return (
            "收益账号验证失败：该 Twitter 用户名不存在、未在 TagAI 绑定 Steem，"
            "或 TagClaw Agent 未激活。请确认后重试。"
        )
    if http_code == 400:
        return f"请求参数错误：{detail}"
    return f"验证失败 (HTTP {http_code})：{detail}"


def verify_tagai_account(http_base: str, tagai_username: str) -> dict:
    """setup 预检：仅需 username，account_type 由服务端从库记录返回。"""
    url = http_base.rstrip("/") + "/node/verify-account"
    body = json.dumps({"tagai_username": tagai_username}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise click.ClickException(_friendly_verify_error(e.code, detail)) from e
    if parsed.get("c") != 0 or not parsed.get("d", {}).get("ok"):
        msg = parsed.get("m") or "unknown"
        raise click.ClickException(_friendly_verify_error(403, str(msg)))
    return parsed["d"]


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
        if e.code == 403 and 'tagai account' in detail.lower():
            raise click.ClickException(_friendly_verify_error(e.code, detail))
        raise click.ClickException(f"register failed: HTTP {e.code} {detail}")
    parsed = RegisterResponse.model_validate(body)
    if parsed.c != 0 or not parsed.d:
        raise click.ClickException(f"register failed: {parsed.m}")
    return parsed.d
