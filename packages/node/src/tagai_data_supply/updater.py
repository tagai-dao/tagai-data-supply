"""tagai-node 自更新：PyInstaller 二进制替换 / pip 升级。"""
from __future__ import annotations

import hashlib
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional

from .http_util import http_headers, no_proxy_opener
from .platform_detect import executable_path, is_frozen_binary, platform_asset_key
from .version import RelayerVersionInfo, get_version, parse_version


class UpdateError(Exception):
    pass


def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers=http_headers())
    with no_proxy_opener().open(req, timeout=120) as resp:
        data = resp.read()
    dest.write_bytes(data)


def _verify_sha256(path: Path, expected: str) -> None:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest.lower() != expected.strip().lower():
        raise UpdateError(f"sha256 mismatch: expected {expected}, got {digest}")


def _read_sha256_sidecar(url: str) -> Optional[str]:
    try:
        req = urllib.request.Request(url, headers=http_headers())
        with no_proxy_opener().open(req, timeout=30) as resp:
            line = resp.read().decode("utf-8", errors="replace").strip().split()[0]
            return line if len(line) >= 64 else None
    except OSError:
        return None


def _replace_executable(target: Path, new_bin: Path) -> None:
    """Unix: 原子替换；Windows: 先写 .new 再替换。"""
    backup = target.with_suffix(target.suffix + ".bak")
    if backup.exists():
        backup.unlink()
    if target.exists():
        shutil.copy2(target, backup)

    if sys.platform == "win32":
        # 运行中的 exe 可能被锁；先尝试直接替换
        try:
            target.unlink()
        except OSError as e:
            raise UpdateError(
                "无法替换 Windows 可执行文件，请先 tagai-node stop 并关闭占用该文件的终端"
            ) from e
        shutil.copy2(new_bin, target)
    else:
        new_bin.replace(target)
        mode = target.stat().st_mode
        target.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def update_frozen_binary(info: RelayerVersionInfo) -> str:
    """下载 Release 二进制并替换当前 sys.executable。返回新版本号。"""
    key = platform_asset_key()
    url = info.download.get(key)
    if not url:
        raise UpdateError(f"Relayer 未提供当前平台 ({key}) 的下载地址")

    old_version = get_version()
    target = Path(executable_path()).resolve()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir) / target.name
        _download(url, tmp)

        expected = info.sha256.get(key)
        if not expected:
            expected = _read_sha256_sidecar(url + ".sha256")
        if expected:
            _verify_sha256(tmp, expected)

        if sys.platform != "win32":
            tmp.chmod(tmp.stat().st_mode | stat.S_IXUSR)

        _replace_executable(target, tmp)

    return info.latest


def update_via_pip(info: RelayerVersionInfo) -> str:
    """pip 安装环境升级（开发或 pipx 用户）。"""
    spec = f"tagai-data-supply-node[scraper]=={info.latest}"
    cmd = [sys.executable, "-m", "pip", "install", "-U", spec]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise UpdateError(proc.stderr.strip() or proc.stdout.strip() or "pip install failed")
    return info.latest


def run_update(info: RelayerVersionInfo, *, stop_callback) -> tuple[str, str]:
    """
    执行更新。stop_callback 应在替换二进制前停止后台 node。
    返回 (old_version, new_version)。
    """
    old = get_version()
    if parse_version(old) >= parse_version(info.latest):
        raise UpdateError(f"已是最新版本 {old}")

    stop_callback()

    if is_frozen_binary():
        new = update_frozen_binary(info)
    else:
        new = update_via_pip(info)

    return old, new
