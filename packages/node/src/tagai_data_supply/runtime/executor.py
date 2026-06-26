"""任务执行器：领 task_assign → 调 scraper → 本地去重 → 组装 task_result。spec §7/P2。"""
from __future__ import annotations
import logging
from typing import Any, Optional, Protocol

from .dedup import BoundedSet
from ..client.protocol import CookieStatus

logger = logging.getLogger(__name__)


class Scraper(Protocol):
    """抓取器接口：适配 twikit 或其它实现。"""
    async def fetch(self, task_type: str, params: dict, cursor: Optional[str] = None) -> dict:  # {tweets, next_cursor, cookie_status}
        ...


class TaskExecutor:
    """单任务执行器（spec §8.1: 单节点单任务串行，由 NodeClient 保证不并发）。"""

    def __init__(self, scraper: Scraper, dedup_capacity: int = 50000):
        self.scraper = scraper
        self.dedup = BoundedSet(dedup_capacity)

    async def handle(self, task_assign: dict) -> dict:
        subtask_id = task_assign.get("subtask_id")
        task_type = task_assign.get("task_type")
        params = task_assign.get("params", {}) or {}
        cursor = task_assign.get("cursor")
        try:
            result = await self.scraper.fetch(task_type, params, cursor)
        except Exception as e:
            logger.exception("scrape failed: %s", e)
            return {
                "type": "task_result",
                "subtask_id": subtask_id,
                "status": "failed",
                "error": str(e),
                "cookie_status": CookieStatus.ERROR.value,
            }

        tweets = result.get("tweets", []) or []
        # 本地预去重（spec §2）
        fresh = []
        for tw in tweets:
            tid = str(tw.get("tweet_id", ""))
            if tid and not self.dedup.seen(tid):
                self.dedup.add(tid)
                fresh.append(tw)

        return {
            "type": "task_result",
            "subtask_id": subtask_id,
            "status": "done",
            "tweets": fresh,
            "next_cursor": result.get("next_cursor"),
            "cookie_status": result.get("cookie_status", CookieStatus.OK.value),
        }
