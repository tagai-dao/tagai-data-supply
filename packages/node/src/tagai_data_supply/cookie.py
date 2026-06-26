"""Cookie 存储与加载。spec §11：本地文件，权限 0600。"""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Optional

from .config import COOKIE_FILE


def save_cookie(ct0: str, auth_token: str, path: Path = COOKIE_FILE) -> None:
    """保存 cookie 到本地，权限 0600。"""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps({"ct0": ct0, "auth_token": auth_token}))
    os.chmod(path, 0o600)


def load_cookie(path: Path = COOKIE_FILE) -> Optional[dict]:
    """读取本地 cookie；不存在返回 None。"""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def has_cookie(path: Path = COOKIE_FILE) -> bool:
    return load_cookie(path) is not None
