"""任务执行器：领 task_assign → 多页抓取 → 本地去重 → watermark 停止 → task_result。"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Optional, Protocol

from .dedup import BoundedSet
from ..client.protocol import CookieStatus
from ..policy_constants import MAX_PAGES_PER_TASK, PAGE_INTERVAL_SEC

logger = logging.getLogger(__name__)


class Scraper(Protocol):
    async def fetch(self, task_type: str, params: dict, cursor: Optional[str] = None) -> dict:
        ...


class TaskExecutor:
    """单任务执行器（单节点串行，最多 MAX_PAGES 页，页间 PAGE_INTERVAL 秒）。"""

    def __init__(self, scraper: Scraper, dedup_capacity: int = 50000):
        self.scraper = scraper
        self.dedup = BoundedSet(dedup_capacity)

    async def handle(self, task_assign: dict) -> dict:
        subtask_id = task_assign.get("subtask_id")
        assignment_id = task_assign.get("assignment_id")
        task_type = task_assign.get("task_type")
        params = task_assign.get("params", {}) or {}
        watermark = task_assign.get("watermark_tweet_id")
        cursor: Optional[str] = task_assign.get("cursor")
        all_fresh: list[dict] = []
        next_cursor: Optional[str] = None
        cookie_status = CookieStatus.OK.value
        stopped_reason: Optional[str] = None
        pages_fetched = 0
        tweets_fetched_raw = 0

        try:
            for page_idx in range(MAX_PAGES_PER_TASK):
                pages_fetched += 1
                result = await self.scraper.fetch(task_type, params, cursor)
                tweets = result.get("tweets", []) or []
                tweets_fetched_raw += len(tweets)
                hit_watermark = False

                for tw in tweets:
                    tid = str(tw.get("tweet_id", ""))
                    if watermark and tid and tid == str(watermark):
                        hit_watermark = True
                        stopped_reason = "watermark"
                        break
                    if tid and not self.dedup.seen(tid):
                        self.dedup.add(tid)
                        all_fresh.append(tw)

                if hit_watermark:
                    break

                next_cursor = result.get("next_cursor")
                cookie_status = result.get("cookie_status", CookieStatus.OK.value)
                if cookie_status != CookieStatus.OK.value:
                    stopped_reason = stopped_reason or f"cookie_{cookie_status}"
                    break
                if not next_cursor:
                    stopped_reason = stopped_reason or "no_next_cursor"
                    break

                cursor = next_cursor
                if page_idx < MAX_PAGES_PER_TASK - 1:
                    await asyncio.sleep(PAGE_INTERVAL_SEC)

        except Exception as e:
            logger.exception("scrape failed: %s", e)
            return {
                "type": "task_result",
                "assignment_id": assignment_id,
                "subtask_id": subtask_id,
                "status": "failed",
                "error": str(e),
                "cookie_status": CookieStatus.ERROR.value,
                "_tweets_fetched_raw": tweets_fetched_raw,
            }

        return {
            "type": "task_result",
            "assignment_id": assignment_id,
            "subtask_id": subtask_id,
            "status": "done",
            "tweets": all_fresh,
            "next_cursor": next_cursor,
            "cookie_status": cookie_status,
            "pages_fetched": pages_fetched,
            "stopped_reason": stopped_reason,
            "_tweets_fetched_raw": tweets_fetched_raw,
        }
