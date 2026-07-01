import pytest
from datetime import datetime, timedelta, timezone
from tagai_data_supply.runtime.executor import TaskExecutor


class MockScraper:
    def __init__(self, result: dict):
        self._result = result

    async def fetch(self, task_type, params, cursor=None):
        return self._result


class PagedScraper:
    def __init__(self, pages: list[dict]):
        self._pages = pages
        self._i = 0

    async def fetch(self, task_type, params, cursor=None):
        if self._i >= len(self._pages):
            return {"tweets": [], "next_cursor": None, "cookie_status": "ok"}
        r = self._pages[self._i]
        self._i += 1
        return r


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
    r = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag", "params": {"q": "#x"}, "cursor": None})
    assert r["type"] == "task_result"
    assert r["assignment_id"] == "asg_1"
    assert r["status"] == "done"
    assert r["next_cursor"] == "999"
    assert len(r["tweets"]) == 2

    # 第二次同样两条 → 本地去重为空
    r2 = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag", "params": {"q": "#x"}, "cursor": "999"})
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
    await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": None})
    # 现在 111 已见；换 scraper 返回 111+113
    ex.scraper = scraper
    r = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": "1"})
    assert len(r["tweets"]) == 1
    assert r["tweets"][0]["tweet_id"] == "113"


@pytest.mark.asyncio
async def test_executor_scraper_error():
    class ErrScraper:
        async def fetch(self, *a, **k):
            raise RuntimeError("boom")
    ex = TaskExecutor(ErrScraper())
    r = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}, "cursor": None})
    assert r["status"] == "failed"
    assert "boom" in r["error"]
    assert r["cookie_status"] == "error"


@pytest.mark.asyncio
async def test_executor_stops_pagination_when_page_tweets_older_than_24h():
    now = datetime.now(timezone.utc)
    recent = (now - timedelta(hours=1)).isoformat()
    old = (now - timedelta(hours=25)).isoformat()
    scraper = PagedScraper([
        {
            "tweets": [{"tweet_id": "1", "content": "new", "tweet_time": recent}],
            "next_cursor": "c2",
            "cookie_status": "ok",
        },
        {
            "tweets": [{"tweet_id": "2", "content": "old", "tweet_time": old}],
            "next_cursor": "c3",
            "cookie_status": "ok",
        },
        {
            "tweets": [{"tweet_id": "3", "content": "skip", "tweet_time": recent}],
            "next_cursor": None,
            "cookie_status": "ok",
        },
    ])
    ex = TaskExecutor(scraper)
    r = await ex.handle({
        "assignment_id": "asg_1",
        "subtask_id": "s1",
        "task_type": "hashtag",
        "params": {"q": "#x"},
        "cursor": None,
    })
    assert r["status"] == "done"
    assert r["pages_fetched"] == 2
    assert r["stopped_reason"] == "tweet_age_24h"
    assert len(r["tweets"]) == 2
    assert scraper._i == 2


@pytest.mark.asyncio
async def test_executor_stops_on_first_page_if_already_stale():
    now = datetime.now(timezone.utc)
    old = (now - timedelta(hours=30)).isoformat()
    scraper = PagedScraper([
        {
            "tweets": [{"tweet_id": "1", "content": "old", "tweet_time": old}],
            "next_cursor": "c2",
            "cookie_status": "ok",
        },
        {
            "tweets": [{"tweet_id": "2", "content": "never", "tweet_time": old}],
            "next_cursor": None,
            "cookie_status": "ok",
        },
    ])
    ex = TaskExecutor(scraper)
    r = await ex.handle({
        "assignment_id": "asg_1",
        "subtask_id": "s1",
        "task_type": "hashtag",
        "params": {},
        "cursor": None,
    })
    assert r["pages_fetched"] == 1
    assert r["stopped_reason"] == "tweet_age_24h"
    assert scraper._i == 1
