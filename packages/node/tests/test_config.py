import stat
import sys

from tagai_data_supply import config


def test_ensure_config_dir_creates(tmp_path, monkeypatch):
    target = tmp_path / "tds"
    monkeypatch.setattr(config, "CONFIG_DIR", target)
    config.ensure_config_dir()
    assert target.exists()
    if sys.platform != "win32":
        mode = stat.S_IMODE(target.stat().st_mode)
        assert mode == 0o700


def test_config_dir_default_under_home(monkeypatch, tmp_path):
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.delenv("TDS_NODE_HOME", raising=False)
    monkeypatch.setattr(config.Path, "home", staticmethod(lambda: fake_home))
    import importlib
    import tagai_data_supply.config as c
    importlib.reload(c)
    assert c.CONFIG_DIR == fake_home / ".tagai_data_supply"


def test_config_dir_from_env(monkeypatch, tmp_path):
    custom = tmp_path / "custom_tds"
    monkeypatch.setenv("TDS_NODE_HOME", str(custom))
    import importlib
    import tagai_data_supply.config as c
    importlib.reload(c)
    assert c.CONFIG_DIR == custom


def test_node_config_defaults():
    nc = config.NodeConfig(relayer_url="ws://h:7700")
    assert nc.node_token == ""
    assert nc.timezone == "UTC"


def test_default_relayer_urls():
    assert config.DEFAULT_RELAYER_HTTP == "https://tds-relayer.tagai.fun"
    assert config.DEFAULT_RELAYER_WS == "wss://tds-relayer.tagai.fun"


def test_resolve_relayer_http():
    assert config.resolve_relayer_http() == config.DEFAULT_RELAYER_HTTP
    assert config.resolve_relayer_http("http://127.0.0.1:7701/") == "http://127.0.0.1:7701"


def test_http_to_ws_url():
    assert config.http_to_ws_url("https://tds-relayer.tagai.fun") == "wss://tds-relayer.tagai.fun"
    assert config.http_to_ws_url("http://127.0.0.1:7701") == "ws://127.0.0.1:7701"
