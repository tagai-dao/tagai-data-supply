import pytest
from unittest.mock import AsyncMock, MagicMock

from tagai_data_supply.scraper_probe import run_scraper_probe, format_probe_report


@pytest.mark.asyncio
async def test_probe_ok_when_main_fetch_returns_tweets():
    scraper = MagicMock()
    scraper.fetch = AsyncMock(return_value={
        "tweets": [{"tweet_id": "1", "twitter_id": "u1", "content": "hello world"}],
        "cookie_status": "ok",
        "next_cursor": "c2",
    })
    scraper.fetch_home_timeline = AsyncMock(return_value={
        "tweets": [], "cookie_status": "ok",
    })
    report = await run_scraper_probe(scraper, query="#test")
    assert report["ok"] is True
    assert report["checks"]["main_fetch"]["tweet_count"] == 1


@pytest.mark.asyncio
async def test_probe_auth_failed_hint():
    scraper = MagicMock()
    scraper.fetch = AsyncMock(return_value={
        "tweets": [], "cookie_status": "auth_failed",
    })
    scraper.fetch_home_timeline = AsyncMock(return_value={
        "tweets": [], "cookie_status": "auth_failed",
    })
    report = await run_scraper_probe(scraper, include_home=True)
    assert report["ok"] is False
    assert "cookie" in report["hint"].lower() or "过期" in report["hint"]


@pytest.mark.asyncio
async def test_probe_fails_when_main_404_even_if_home_works():
    scraper = MagicMock()
    scraper.fetch = AsyncMock(return_value={
        "tweets": [],
        "cookie_status": "error",
        "error": 'NotFound: status: 404, message: ""',
    })
    scraper.fetch_home_timeline = AsyncMock(return_value={
        "tweets": [{"tweet_id": "1", "content": "home"}],
        "cookie_status": "ok",
    })
    report = await run_scraper_probe(scraper, include_home=True)
    assert report["ok"] is False
    assert "404" in report["hint"]
    assert "更新" in report["hint"]


def test_format_probe_report_masks_cookie():
    text = format_probe_report(
        {"ok": False, "task_type": "hashtag", "params": {"q": "#x"}, "checks": {}, "hint": "x"},
        cookie_meta={"ct0": "abcdefghij", "auth_token": "1234567890"},
    )
    assert "abcd...ghij" in text
    assert "1234...7890" in text
