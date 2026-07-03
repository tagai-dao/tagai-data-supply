"""Relayer HTTP 工具：禁用系统代理 + 统一 User-Agent。

Cloudflare 等 CDN 可能拦截默认 Python-urllib User-Agent（403），需显式标识客户端。
"""
from __future__ import annotations

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
