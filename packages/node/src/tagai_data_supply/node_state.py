"""节点状态持久化：node_id + node_token + relayer_url。spec §11。"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional

from .config import NODE_STATE_FILE, NodeConfig


def save_state(cfg: NodeConfig, path: Path = NODE_STATE_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps({
        "relayer_url": cfg.relayer_url,
        "node_token": cfg.node_token,
        "timezone": cfg.timezone,
    }))
    try:
        import os
        os.chmod(path, 0o600)
    except OSError:
        pass


def load_state(path: Path = NODE_STATE_FILE) -> Optional[NodeConfig]:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return NodeConfig(
            relayer_url=data["relayer_url"],
            node_token=data.get("node_token", ""),
            timezone=data.get("timezone", "UTC"),
        )
    except (json.JSONDecodeError, KeyError, OSError):
        return None
