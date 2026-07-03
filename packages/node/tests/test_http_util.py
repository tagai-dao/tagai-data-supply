from tagai_data_supply.http_util import http_headers, user_agent


def test_user_agent_prefix():
    assert user_agent().startswith("tagai-node/")


def test_http_headers_merges_extra():
    headers = http_headers({"Content-Type": "application/json"})
    assert headers["User-Agent"].startswith("tagai-node/")
    assert headers["Content-Type"] == "application/json"
