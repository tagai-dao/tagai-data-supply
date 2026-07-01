from datetime import datetime, timedelta, timezone

from tagai_data_supply.runtime.tweet_time import (
    oldest_tweet_time,
    page_exceeds_max_age,
    parse_tweet_time,
)


def test_parse_tweet_time_iso():
    dt = parse_tweet_time("2026-07-01T10:00:00+00:00")
    assert dt is not None
    assert dt.year == 2026


def test_parse_tweet_time_epoch_seconds():
    dt = parse_tweet_time(1_700_000_000)
    assert dt is not None


def test_oldest_tweet_time_picks_furthest():
    now = datetime.now(timezone.utc)
    tweets = [
        {"tweet_time": (now - timedelta(hours=1)).isoformat()},
        {"tweet_time": (now - timedelta(hours=10)).isoformat()},
        {"tweet_time": (now - timedelta(hours=5)).isoformat()},
    ]
    oldest = oldest_tweet_time(tweets)
    assert oldest is not None
    assert oldest < now - timedelta(hours=9)


def test_page_exceeds_max_age_when_oldest_over_24h():
    now = datetime.now(timezone.utc)
    tweets = [{"tweet_time": (now - timedelta(hours=25)).isoformat()}]
    assert page_exceeds_max_age(tweets, max_hours=24, now=now) is True


def test_page_exceeds_max_age_false_when_recent():
    now = datetime.now(timezone.utc)
    tweets = [{"tweet_time": (now - timedelta(hours=2)).isoformat()}]
    assert page_exceeds_max_age(tweets, max_hours=24, now=now) is False


def test_page_exceeds_max_age_false_when_no_time():
    assert page_exceeds_max_age([{"tweet_id": "1"}], max_hours=24) is False
