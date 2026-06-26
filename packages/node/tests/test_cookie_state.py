import json
import stat
from tagai_data_supply import cookie, node_state, config
from tagai_data_supply.config import NodeConfig


def test_save_and_load_cookie(tmp_path, monkeypatch):
    p = tmp_path / "cookie.json"
    monkeypatch.setattr(cookie, "COOKIE_FILE", p)
    cookie.save_cookie("ct0val", "authval", path=p)
    assert p.exists()
    mode = stat.S_IMODE(p.stat().st_mode)
    assert mode == 0o600
    loaded = cookie.load_cookie(path=p)
    assert loaded == {"ct0": "ct0val", "auth_token": "authval"}


def test_load_cookie_missing(tmp_path):
    assert cookie.load_cookie(path=tmp_path / "nope.json") is None


def test_save_and_load_state(tmp_path, monkeypatch):
    p = tmp_path / "state.json"
    monkeypatch.setattr(node_state, "NODE_STATE_FILE", p)
    cfg = NodeConfig(relayer_url="ws://h:7701", node_token="tok123", timezone="Asia/Shanghai")
    node_state.save_state(cfg, path=p)
    loaded = node_state.load_state(path=p)
    assert loaded is not None
    assert loaded.relayer_url == "ws://h:7701"
    assert loaded.node_token == "tok123"
    assert loaded.timezone == "Asia/Shanghai"


def test_load_state_missing(tmp_path):
    assert node_state.load_state(path=tmp_path / "nope.json") is None
