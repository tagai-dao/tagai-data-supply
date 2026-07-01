"""推文发布时间解析（翻页年龄截止）。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Optional


def parse_tweet_time(value: Any) -> Optional[datetime]:
    """将 tweet_time 规范为 UTC datetime。"""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        sec = float(value) / 1000 if value > 1e12 else float(value)
        return datetime.fromtimestamp(sec, tz=timezone.utc)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            pass
        try:
            return parsedate_to_datetime(s).astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            pass
    return None


def oldest_tweet_time(tweets: list[dict]) -> Optional[datetime]:
    """本页所有推文里最旧（最远）的发布时间。"""
    parsed = [
        t for tw in tweets
        if (t := parse_tweet_time(tw.get("tweet_time"))) is not None
    ]
    return min(parsed) if parsed else None


def page_exceeds_max_age(
    tweets: list[dict],
    *,
    max_hours: int,
    now: Optional[datetime] = None,
) -> bool:
    """本页最远一条若早于 max_hours 前，则不应继续翻页。"""
    oldest = oldest_tweet_time(tweets)
    if oldest is None:
        return False
    ref = now or datetime.now(timezone.utc)
    return oldest < ref - timedelta(hours=max_hours)
