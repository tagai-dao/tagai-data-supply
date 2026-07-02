"""CLI 包版本解析与 Relayer 版本信息查询。"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional, Tuple

try:
    from importlib.metadata import PackageNotFoundError, version as pkg_version
except ImportError:  # pragma: no cover
    from importlib_metadata import PackageNotFoundError, version as pkg_version  # type: ignore

PACKAGE_NAME = "tagai-data-supply-node"
_VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")


def get_version() -> str:
    """当前安装版本（pyproject / 已安装 wheel / 二进制打包时写入）。"""
    try:
        return pkg_version(PACKAGE_NAME)
    except PackageNotFoundError:
        from . import __version__

        return __version__


def parse_version(text: str) -> Tuple[int, int, int]:
    """解析 semver 主.次.补丁，非法则抛 ValueError。"""
    m = _VERSION_RE.match(str(text).strip())
    if not m:
        raise ValueError(f"invalid version: {text!r}")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def format_version(v: Tuple[int, int, int]) -> str:
    return f"{v[0]}.{v[1]}.{v[2]}"


def major_of(text: str) -> int:
    return parse_version(text)[0]


@dataclass
class RelayerVersionInfo:
    latest: str
    min_major: int
    download: dict[str, str]
    sha256: dict[str, str]

    @classmethod
    def from_api(cls, data: dict) -> "RelayerVersionInfo":
        return cls(
            latest=str(data.get("latest") or "0.0.0"),
            min_major=int(data.get("min_major") or 0),
            download={k: str(v) for k, v in (data.get("download") or {}).items() if v},
            sha256={k: str(v) for k, v in (data.get("sha256") or {}).items() if v},
        )


def fetch_relayer_version_info(http_base: str, timeout: float = 15.0) -> Optional[RelayerVersionInfo]:
    """GET {http_base}/node/version → 最新版与下载地址。"""
    base = http_base.rstrip("/")
    url = f"{base}/node/version"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(body, dict) or body.get("c") != 0:
        return None
    data = body.get("d")
    if not isinstance(data, dict):
        return None
    return RelayerVersionInfo.from_api(data)


def version_status(local: str, info: Optional[RelayerVersionInfo]) -> str:
    """人类可读运行状态。"""
    if info is None:
        return "unknown (无法查询 Relayer)"
    loc = parse_version(local)
    if loc[0] < info.min_major:
        return f"blocked (需要 major >= {info.min_major})"
    try:
        lat = parse_version(info.latest)
    except ValueError:
        return "ok"
    if loc < lat:
        return "upgrade available"
    return "ok"
