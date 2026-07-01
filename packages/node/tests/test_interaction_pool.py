from tagai_data_supply import interaction_pool


def test_add_and_pick(tmp_path, monkeypatch):
    monkeypatch.setenv("TDS_NODE_HOME", str(tmp_path))
    import importlib
    import tagai_data_supply.config as cfg
    import tagai_data_supply.runtime_store as rs
    import tagai_data_supply.interaction_pool as pool
    importlib.reload(cfg)
    importlib.reload(rs)
    importlib.reload(pool)

    pool.add_tweets([
        {"tweet_id": "100", "content": "hello world from task"},
        {"tweet_id": "101", "content": "another tweet content here"},
    ])
    assert pool.pool_size() == 2
    tid = pool.pick_tweet_id_for_like(set())
    assert tid in ("100", "101")
    text = pool.pick_text_for_post()
    assert text and len(text) >= 10
