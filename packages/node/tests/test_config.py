import os
import stat
from tagai_data_supply import config


def test_ensure_config_dir_creates_with_0700(tmp_path, monkeypatch):
    target = tmp_path / "tds"
    monkeypatch.setattr(config, "CONFIG_DIR", target)
    config.ensure_config_dir()
    assert target.exists()
    mode = stat.S_IMODE(target.stat().st_mode)
    assert mode == 0o700


def test_config_dir_default_under_home(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("TDS_NODE_HOME", raising=False)
    # 重新计算 CONFIG_DIR
    import importlib
    import tagai_data_supply.config as c
    importlib.reload(c)
    assert str(c.CONFIG_DIR) == str(tmp_path / ".tagai_data_supply")


def test_node_config_defaults():
    nc = config.NodeConfig(relayer_url="ws://h:7700")
    assert nc.node_token == ""
    assert nc.timezone == "UTC"
