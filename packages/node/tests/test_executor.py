import pytest
from datetime import datetime, timedelta, timezone
from tagai_data_supply.runtime.executor import TaskExecutor, _at_or_below_watermark


class MockScraper:
    def __init__(self, result: dict):
        self._result = result

    async def fetch(self, task_type, params, cursor=None, parent_resolver=None):
        return self._result


class PagedScraper:
    def __init__(self, pages: list[dict]):
        self._pages = pages
        self._i = 0
        self.cursors: list[str | None] = []

    async def fetch(self, task_type, params, cursor=None, parent_resolver=None):
        self.cursors.append(cursor)
        if self._i >= len(self._pages):
            return {"tweets": [], "next_cursor": None, "cookie_status": "ok"}
        r = self._pages[self._i]
        self._i += 1
        return r


def test_at_or_below_watermark():
    assert _at_or_below_watermark("100", "100") is True
    assert _at_or_below_watermark("99", "100") is True
    assert _at_or_below_watermark("101", "100") is False


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
    r = await ex.handle({
        "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {"q": "#x"},
    })
    assert r["type"] == "task_result"
    assert r["status"] == "done"
    assert len(r["tweets"]) == 2
    assert "next_cursor" not in r

    r2 = await ex.handle({
        "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {"q": "#x"},
    })
    assert r2["status"] == "done"
    assert r2["tweets"] == []


@pytest.mark.asyncio
async def test_executor_always_starts_from_first_page():
    """忽略 task_assign.cursor，每次从 Twitter 第一页开始。"""
    scraper = PagedScraper([
        {"tweets": [{"tweet_id": "201", "content": "a"}], "next_cursor": "p2", "cookie_status": "ok"},
        {"tweets": [{"tweet_id": "200", "content": "b"}], "next_cursor": None, "cookie_status": "ok"},
    ])
    ex = TaskExecutor(scraper)
    await ex.handle({
        "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {}, "cursor": "old_twitter_cursor_should_be_ignored",
        "watermark_tweet_id": "200",
    })
    assert scraper.cursors[0] is None


@pytest.mark.asyncio
async def test_executor_stops_at_watermark():
    scraper = PagedScraper([
        {
            "tweets": [
                {"tweet_id": "300", "content": "new"},
                {"tweet_id": "200", "content": "watermark"},
                {"tweet_id": "199", "content": "old"},
            ],
            "next_cursor": "p2",
            "cookie_status": "ok",
        },
        {"tweets": [{"tweet_id": "198", "content": "never"}], "next_cursor": None, "cookie_status": "ok"},
    ])
    ex = TaskExecutor(scraper)
    r = await ex.handle({
        "assignment_id": "asg_1", "subtask_id": "s1", "task_type": "hashtag",
        "params": {}, "watermark_tweet_id": "200",
    })
    assert r["stopped_reason"] == "watermark"
    assert len(r["tweets"]) == 1
    assert r["tweets"][0]["tweet_id"] == "300"
    assert scraper._i == 1


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
    await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}})
    ex.scraper = scraper
    r = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}})
    assert len(r["tweets"]) == 1
    assert r["tweets"][0]["tweet_id"] == "113"


@pytest.mark.asyncio
async def test_executor_scraper_error():
    class ErrScraper:
        async def fetch(self, *a, **k):
            raise RuntimeError("boom")
    ex = TaskExecutor(ErrScraper())
    r = await ex.handle({"assignment_id": "asg_1", "subtask_id": "s", "task_type": "hashtag", "params": {}})
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
    })
    assert r["pages_fetched"] == 1
    assert r["stopped_reason"] == "tweet_age_24h"
    assert scraper._i == 1
