from tagai_data_supply.http_util import http_headers, user_agent, ssl_context


def test_user_agent_prefix():
    assert user_agent().startswith("tagai-node/")


def test_http_headers_merges_extra():
    headers = http_headers({"Content-Type": "application/json"})
    assert headers["User-Agent"].startswith("tagai-node/")
    assert headers["Content-Type"] == "application/json"


def test_ssl_context_loads():
    ctx = ssl_context()
    assert ctx is not None
    assert ctx.verify_mode != 0  # 默认应校验对端证书
