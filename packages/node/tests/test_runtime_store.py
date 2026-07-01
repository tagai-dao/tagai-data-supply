import json
from tagai_data_supply.runtime_store import build_status_snapshot, Manifest


def test_build_status_snapshot():
    m = Manifest(node_id="n1", relayer_http="http://h:7701", tagai_username="alice", tagai_account_type=0)
    snap = build_status_snapshot(phase="stopped", manifest=m, cookie_configured=True)
    assert snap["node_id"] == "n1"
    assert snap["tagai_username"] == "alice"
    assert snap["cookie_configured"] is True
    assert snap["phase"] == "stopped"
