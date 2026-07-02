from tagai_data_supply.version import parse_version, format_version, version_status, RelayerVersionInfo


def test_parse_version():
    assert parse_version("1.2.3") == (1, 2, 3)
    assert parse_version("v0.1.0") == (0, 1, 0)


def test_version_status():
    info = RelayerVersionInfo(latest="1.0.0", min_major=1, download={}, sha256={})
    assert "blocked" in version_status("0.9.0", info)
    assert version_status("1.0.0", info) == "ok"
    assert version_status("0.1.0", None) == "unknown (无法查询 Relayer)"
