"""本地配置管理：~/.tagai_data_supply/ 目录。spec §11。"""
import os
from pathlib import Path
from dataclasses import dataclass

CONFIG_DIR = Path(os.environ.get("TDS_NODE_HOME", Path.home() / ".tagai_data_supply"))
COOKIE_FILE = CONFIG_DIR / "cookie.json"
NODE_STATE_FILE = CONFIG_DIR / "node_state.json"

# 官方 Relayer（用户无需手动填写；本地开发可用 CLI --http-base 覆盖）
DEFAULT_RELAYER_HTTP = "https://tds-relayer.tagai.fun"
DEFAULT_RELAYER_WS = "wss://tds-relayer.tagai.fun"


def resolve_relayer_http(http_base: str | None = None) -> str:
    """解析 Relayer HTTP 基址，未指定时用官方默认。"""
    return (http_base or DEFAULT_RELAYER_HTTP).strip().rstrip("/")


def http_to_ws_url(http_base: str) -> str:
    """HTTP(S) 基址转 WebSocket URL。"""
    return http_base.replace("http://", "ws://").replace("https://", "wss://")


@dataclass
class NodeConfig:
    """节点运行配置（由 configure 子命令写入，run 子命令读取）。"""
    relayer_url: str           # ws://host:port
    node_token: str = ""       # 注册后获得；未注册时为空
    timezone: str = "UTC"


def ensure_config_dir() -> Path:
    """创建配置目录，权限 0o700（owner-only）。spec §11。"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    # 已存在目录不改变权限，主动确保
    try:
        os.chmod(CONFIG_DIR, 0o700)
    except OSError:
        pass
    return CONFIG_DIR
