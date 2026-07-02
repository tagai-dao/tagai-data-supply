"""当前运行平台标识（与 GitHub Release 资产名对应）。"""
from __future__ import annotations

import platform
import sys


def platform_asset_key() -> str:
    """返回 download map 的 key，如 linux_amd64。"""
    system = sys.platform
    machine = platform.machine().lower()

    if system.startswith("linux"):
        arch = "arm64" if machine in ("aarch64", "arm64") else "amd64"
        return f"linux_{arch}"
    if system == "darwin":
        arch = "arm64" if machine == "arm64" else "amd64"
        return f"darwin_{arch}"
    if system in ("win32", "cygwin"):
        return "windows_amd64"
    raise RuntimeError(f"unsupported platform: {system} {machine}")


def is_frozen_binary() -> bool:
    return bool(getattr(sys, "frozen", False))


def executable_path() -> str:
    return sys.executable
