"""节点 manifest 与运行时状态（供 status / agent 只读查询）。"""
from __future__ import annotations
import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import CONFIG_DIR, ensure_config_dir

MANIFEST_FILE = CONFIG_DIR / "manifest.json"
RUNTIME_DIR = CONFIG_DIR / "runtime"
STATUS_FILE = RUNTIME_DIR / "status.json"


@dataclass
class Manifest:
    node_id: str = ""
    relayer_http: str = ""
    relayer_url: str = ""
    tagai_username: str = ""
    tagai_account_type: int = 0
    timezone: str = "UTC"
    configured_at: str = ""


def _atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(path)


def save_manifest(m: Manifest) -> None:
    ensure_config_dir()
    _atomic_write(MANIFEST_FILE, asdict(m))


def load_manifest() -> Optional[Manifest]:
    if not MANIFEST_FILE.exists():
        return None
    try:
        data = json.loads(MANIFEST_FILE.read_text())
        return Manifest(**{k: data[k] for k in Manifest.__dataclass_fields__ if k in data})
    except (json.JSONDecodeError, OSError, TypeError):
        return None


def write_status(patch: dict[str, Any]) -> None:
    """合并写入 runtime/status.json。"""
    ensure_config_dir()
    current: dict[str, Any] = {}
    if STATUS_FILE.exists():
        try:
            current = json.loads(STATUS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            current = {}
    current.update(patch)
    current["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(STATUS_FILE, current)


def read_status() -> dict[str, Any]:
    if not STATUS_FILE.exists():
        return {}
    try:
        return json.loads(STATUS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def build_status_snapshot(*, phase: str, manifest: Optional[Manifest] = None,
                          cookie_configured: bool = False, relayer_connected: bool = False,
                          extra: Optional[dict] = None) -> dict[str, Any]:
    m = manifest or load_manifest()
    snap: dict[str, Any] = {
        "phase": phase,
        "configured": m is not None and bool(m.node_id),
        "node_id": m.node_id if m else None,
        "relayer_http": m.relayer_http if m else None,
        "tagai_username": m.tagai_username if m else None,
        "tagai_account_type": m.tagai_account_type if m else None,
        "cookie_configured": cookie_configured,
        "relayer_connected": relayer_connected,
    }
    if extra:
        snap.update(extra)
    return snap
