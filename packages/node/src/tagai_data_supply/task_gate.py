"""Node 任务接收门禁：时区静默、动态冷却、日配额。由 Node 自主决定拒绝。"""
from __future__ import annotations
import json
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from .policy_constants import (
    QUIET_HOUR_START, QUIET_HOUR_END,
    MIN_COOLDOWN_MINUTES, MAX_COOLDOWN_MINUTES,
    DAILY_TWEET_LIMIT,
)
from .runtime_store import RUNTIME_DIR, ensure_config_dir

SCHEDULER_STATE_FILE = RUNTIME_DIR / "scheduler_state.json"


def format_recover_duration(seconds: int) -> str:
    """将剩余秒数格式化为人类可读时长。"""
    seconds = max(0, int(seconds))
    if seconds >= 3600:
        h, rem = divmod(seconds, 3600)
        m, s = divmod(rem, 60)
        if s:
            return f"{h}h{m}m{s}s"
        if m:
            return f"{h}h{m}m"
        return f"{h}h"
    if seconds >= 60:
        m, s = divmod(seconds, 60)
        return f"{m}m{s}s" if s else f"{m}m"
    return f"{seconds}s"


def format_decline_recovery(reason: Optional[str], recover_in_sec: Optional[int]) -> str:
    """拒绝日志中的恢复剩余时间描述。"""
    if reason == "busy":
        return "after_current_task"
    if recover_in_sec is None:
        return "-"
    return format_recover_duration(recover_in_sec)


class TaskGate:
    """任务接收策略（静默拒绝，不扣 Relayer health）。"""

    def __init__(self, tz_offset: int = 8):
        self.tz_offset = int(tz_offset)
        self._busy = False

    def set_tz_offset(self, offset: int) -> None:
        self.tz_offset = int(offset)

    def set_busy(self, busy: bool) -> None:
        self._busy = busy

    def is_busy(self) -> bool:
        return self._busy

    def _local_now(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(hours=self.tz_offset)

    def in_quiet_hours(self) -> bool:
        h = self._local_now().hour
        return QUIET_HOUR_START <= h < QUIET_HOUR_END

    def _load(self) -> dict:
        if not SCHEDULER_STATE_FILE.exists():
            return {}
        try:
            return json.loads(SCHEDULER_STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}

    def _save(self, data: dict) -> None:
        ensure_config_dir()
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        SCHEDULER_STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def _today_key(self) -> str:
        return self._local_now().strftime("%Y%m%d")

    def _reset_daily_if_needed(self, st: dict) -> None:
        today = self._today_key()
        if st.get("daily_date") != today:
            st["daily_date"] = today
            st["daily_tweet_count"] = 0

    def _seconds_until_iso(self, iso: str) -> int:
        try:
            na = datetime.fromisoformat(iso)
            if na.tzinfo is None:
                na = na.replace(tzinfo=timezone.utc)
            return max(0, int((na - datetime.now(timezone.utc)).total_seconds()))
        except ValueError:
            return 0

    def _seconds_until_quiet_ends(self) -> int:
        now = self._local_now()
        end = now.replace(hour=QUIET_HOUR_END, minute=0, second=0, microsecond=0)
        if now >= end:
            end += timedelta(days=1)
        return max(0, int((end - now).total_seconds()))

    def _seconds_until_next_day(self) -> int:
        now = self._local_now()
        next_day = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return max(0, int((next_day - now).total_seconds()))

    def check_accept(self) -> Tuple[bool, Optional[str], Optional[int]]:
        """是否可接受新任务。返回 (ok, decline_reason, recover_in_sec)。"""
        if self._busy:
            return False, "busy", None
        if self.in_quiet_hours():
            return False, "quiet_hours", self._seconds_until_quiet_ends()
        st = self._load()
        self._reset_daily_if_needed(st)
        if st.get("daily_tweet_count", 0) >= DAILY_TWEET_LIMIT:
            return False, "daily_quota", self._seconds_until_next_day()
        next_after = st.get("next_accept_after")
        if next_after:
            recover = self._seconds_until_iso(next_after)
            if recover > 0:
                return False, "min_interval", recover
        return True, None, None

    def on_task_completed(self, tweets_fetched: int) -> None:
        """任务完成后：累计日配额 + 随机冷却。"""
        st = self._load()
        self._reset_daily_if_needed(st)
        st["daily_tweet_count"] = int(st.get("daily_tweet_count", 0)) + max(0, tweets_fetched)
        mins = random.uniform(MIN_COOLDOWN_MINUTES, MAX_COOLDOWN_MINUTES)
        st["next_accept_after"] = (datetime.now(timezone.utc) + timedelta(minutes=mins)).isoformat()
        st["last_task_completed_at"] = datetime.now(timezone.utc).isoformat()
        self._save(st)

    def status_snapshot(self) -> dict:
        st = self._load()
        self._reset_daily_if_needed(st)
        return {
            "tz_offset": self.tz_offset,
            "in_quiet_hours": self.in_quiet_hours(),
            "daily_date": st.get("daily_date"),
            "daily_tweet_count": st.get("daily_tweet_count", 0),
            "daily_tweet_limit": DAILY_TWEET_LIMIT,
            "next_accept_after": st.get("next_accept_after"),
            "last_task_completed_at": st.get("last_task_completed_at"),
        }
