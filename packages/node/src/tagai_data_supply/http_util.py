"""Relayer HTTP 工具：禁用系统代理 + 统一 User-Agent + SSL CA。

Cloudflare 等 CDN 可能拦截默认 Python-urllib User-Agent（403），需显式标识客户端。
PyInstaller 冻结二进制缺系统 CA 时，用 certifi 构建 SSLContext。
"""
from __future__ import annotations

import ssl
import urllib.request
from typing import Mapping, Optional

from . import __version__


def user_agent() -> str:
    return f"tagai-node/{__version__}"


def http_headers(extra: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    headers = {"User-Agent": user_agent()}
    if extra:
        headers.update(dict(extra))
    return headers


def no_proxy_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def ssl_context() -> ssl.SSLContext:
    """构建带 CA 的 SSLContext，供 urllib / websockets 共用。"""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
