import pytest
from tagai_data_supply.runtime.executor import TaskExecutor


class MockScraper:
    def __init__(self, result: dict):
        self._result = result

    async def fetch(self, task_type, params, cursor=None):
        return self._result


@pytest.mark.asyncio
async def test_executor_dedup_local():
    scraper = MockScraper({
        "tweets": [
            {"tweet_id": "111", "content": "a"},
            {"tweet_id": "112", "content": "b"},
        ],
        "next_cursor": "999",
        "cookie_status": "ok",
    })
    ex = TaskExecutor(scraper)
    r = await ex.handle({"subtask_id": "s1", "task_type": "hashtag", "params": {"q": "#x"}, "cursor": None})
    assert r["type"] == "task_result"
    assert r["status"] == "done"
    assert r["next_cursor"] == "999"
    assert len(r["tweets"]) == 2

    # 第二次同样两条 → 本地去重为空
    r2 = await ex.handle({"subtask_id": "s1", "task_type": "hashtag", "params": {"q": "#x"}, "cursor": "999"})
    assert r2["status"] == "done"
    assert r2["tweets"] == []  # 都已见过


@pytest.mark.asyncio
async def test_executor_partial_dedup():
    scraper = MockScraper({
        "tweets": [
            {"tweet_id": "111", "content": "seen"},
            {"tweet_id": "113", "content": "new"},
        ],
        "next_cursor": None,
        "cookie_status": "ok",
    })
    ex = TaskExecutor(MockScraper({
        "tweets": [{"tweet_id": "111", "content": "a"}], "next_cursor": "1", "cookie_status": "ok",
    }))
    await ex.handle({"subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": None})
    # 现在 111 已见；换 scraper 返回 111+113
    ex.scraper = scraper
    r = await ex.handle({"subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": "1"})
    assert len(r["tweets"]) == 1
    assert r["tweets"][0]["tweet_id"] == "113"


@pytest.mark.asyncio
async def test_executor_scraper_error():
    class ErrScraper:
        async def fetch(self, *a, **k):
            raise RuntimeError("boom")
    ex = TaskExecutor(ErrScraper())
    r = await ex.handle({"subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": None})
    assert r["status"] == "failed"
    assert "boom" in r["error"]
    assert r["cookie_status"] == "error"
