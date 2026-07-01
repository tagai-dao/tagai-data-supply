"""养号状态持久化（发帖/点赞计划）。"""
from __future__ import annotations
import json
import random
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from .runtime_store import RUNTIME_DIR, ensure_config_dir
from .policy_constants import (
    POST_INTERVAL_HOURS, SOCIAL_DAYTIME_START, SOCIAL_DAYTIME_END,
    DAILY_LIKES_MIN, DAILY_LIKES_MAX, LIKED_IDS_MAX,
)

SOCIAL_STATE_FILE = RUNTIME_DIR / "social_state.json"


def _load() -> dict[str, Any]:
    if not SOCIAL_STATE_FILE.exists():
        return {}
    try:
        return json.loads(SOCIAL_STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict[str, Any]) -> None:
    ensure_config_dir()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    SOCIAL_STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def local_now(tz_offset: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=tz_offset)


def today_key(tz_offset: int) -> str:
    return local_now(tz_offset).strftime("%Y%m%d")


def in_daytime(tz_offset: int, hour: Optional[int] = None) -> bool:
    h = hour if hour is not None else local_now(tz_offset).hour
    return SOCIAL_DAYTIME_START <= h < SOCIAL_DAYTIME_END


def random_daytime_datetime(tz_offset: int, base_local: datetime) -> datetime:
    """在 base 所在日的 [daytime_start, daytime_end) 内随机时刻（UTC）。"""
    day = base_local.date()
    start_min = SOCIAL_DAYTIME_START * 60
    end_min = SOCIAL_DAYTIME_END * 60 - 1
    minute_of_day = random.randint(start_min, end_min)
    hour = minute_of_day // 60
    minute = minute_of_day % 60
    local_naive = datetime(day.year, day.month, day.day, hour, minute)
    return (local_naive - timedelta(hours=tz_offset)).replace(tzinfo=timezone.utc)


def ensure_daily_like_plan(tz_offset: int) -> dict[str, Any]:
    st = _load()
    tk = today_key(tz_offset)
    if st.get("like_plan_date") == tk and st.get("scheduled_like_times"):
        return st
    target = random.randint(DAILY_LIKES_MIN, DAILY_LIKES_MAX)
    now_local = local_now(tz_offset)
    times: list[str] = []
    for _ in range(target):
        base = now_local if in_daytime(tz_offset) else now_local + timedelta(days=1)
        dt = random_daytime_datetime(tz_offset, base)
        if dt <= datetime.now(timezone.utc):
            dt = random_daytime_datetime(tz_offset, now_local + timedelta(days=1))
        times.append(dt.isoformat())
    times.sort()
    st["like_plan_date"] = tk
    st["daily_like_target"] = target
    st["daily_likes_done"] = 0
    st["scheduled_like_times"] = times
    _save(st)
    return st


def schedule_next_post(tz_offset: int, from_utc: Optional[datetime] = None) -> str:
    """距上次/失败后 30h，再落到随机白天时刻。"""
    base = from_utc or datetime.now(timezone.utc)
    earliest = base + timedelta(hours=POST_INTERVAL_HOURS)
    local_earliest = earliest + timedelta(hours=tz_offset)
    if not in_daytime(tz_offset, local_earliest.hour):
        if local_earliest.hour >= SOCIAL_DAYTIME_END:
            local_earliest = local_earliest + timedelta(days=1)
        local_earliest = local_earliest.replace(
            hour=SOCIAL_DAYTIME_START, minute=random.randint(0, 59), second=0, microsecond=0,
        )
    next_dt = random_daytime_datetime(tz_offset, local_earliest)
    attempts = 0
    while next_dt < earliest and attempts < 10:
        next_dt = random_daytime_datetime(tz_offset, local_earliest + timedelta(days=1))
        attempts += 1
    st = _load()
    st["next_post_at"] = next_dt.isoformat()
    _save(st)
    return next_dt.isoformat()


def mark_post_success(tz_offset: int) -> None:
    st = _load()
    st["last_post_at"] = datetime.now(timezone.utc).isoformat()
    _save(st)
    schedule_next_post(tz_offset)


def mark_post_skipped(tz_offset: int) -> None:
    schedule_next_post(tz_offset)


def due_like(st: Optional[dict] = None) -> bool:
    st = st or _load()
    times: list[str] = st.get("scheduled_like_times") or []
    done = int(st.get("daily_likes_done") or 0)
    if done >= len(times):
        return False
    nxt = times[done]
    try:
        na = datetime.fromisoformat(nxt)
        if na.tzinfo is None:
            na = na.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= na
    except ValueError:
        return False


def mark_like_done(tweet_id: str) -> None:
    st = _load()
    st["daily_likes_done"] = int(st.get("daily_likes_done") or 0) + 1
    liked: list[str] = st.get("liked_tweet_ids") or []
    if tweet_id not in liked:
        liked.append(tweet_id)
    if len(liked) > LIKED_IDS_MAX:
        liked = liked[-LIKED_IDS_MAX:]
    st["liked_tweet_ids"] = liked
    _save(st)


def liked_set() -> set[str]:
    return set(_load().get("liked_tweet_ids") or [])


def post_due(tz_offset: int) -> bool:
    st = _load()
    nxt = st.get("next_post_at")
    if not nxt:
        schedule_next_post(tz_offset)
        return False
    try:
        na = datetime.fromisoformat(nxt)
        if na.tzinfo is None:
            na = na.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= na
    except ValueError:
        return False


def status_snapshot(tz_offset: int) -> dict[str, Any]:
    st = ensure_daily_like_plan(tz_offset)
    done = int(st.get("daily_likes_done") or 0)
    times = st.get("scheduled_like_times") or []
    return {
        "last_post_at": st.get("last_post_at"),
        "next_post_at": st.get("next_post_at"),
        "daily_like_target": st.get("daily_like_target"),
        "daily_likes_done": done,
        "next_like_at": times[done] if done < len(times) else None,
    }
