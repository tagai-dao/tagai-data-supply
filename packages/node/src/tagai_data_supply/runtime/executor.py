"""任务执行器：领 task_assign → 多页抓取 → 本地去重 → watermark 停止 → task_result。"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Optional, Protocol

from .dedup import BoundedSet
from .tweet_time import oldest_tweet_time, page_exceeds_max_age
from ..client.protocol import CookieStatus
from ..policy_constants import MAX_PAGES_PER_TASK, PAGE_INTERVAL_SEC, PAGE_MAX_TWEET_AGE_HOURS

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

        logger.info(
            "task start | subtask=%s type=%s params=%s watermark=%s",
            subtask_id, task_type, params, watermark or "-",
        )

        try:
            for page_idx in range(MAX_PAGES_PER_TASK):
                pages_fetched += 1
                logger.info(
                    "task page | subtask=%s page=%d/%d cursor=%s",
                    subtask_id, pages_fetched, MAX_PAGES_PER_TASK,
                    "yes" if cursor else "no",
                )
                result = await self.scraper.fetch(task_type, params, cursor)
                tweets = result.get("tweets", []) or []
                tweets_fetched_raw += len(tweets)
                hit_watermark = False
                page_fresh = 0

                for tw in tweets:
                    tid = str(tw.get("tweet_id", ""))
                    if watermark and tid and tid == str(watermark):
                        hit_watermark = True
                        stopped_reason = "watermark"
                        break
                    if tid and not self.dedup.seen(tid):
                        self.dedup.add(tid)
                        all_fresh.append(tw)
                        page_fresh += 1

                logger.info(
                    "task page done | subtask=%s page=%d raw=%d fresh=%d watermark_hit=%s",
                    subtask_id, pages_fetched, len(tweets), page_fresh, hit_watermark,
                )

                if hit_watermark:
                    break

                if page_exceeds_max_age(tweets, max_hours=PAGE_MAX_TWEET_AGE_HOURS):
                    oldest = oldest_tweet_time(tweets)
                    stopped_reason = "tweet_age_24h"
                    logger.info(
                        "task page stale | subtask=%s oldest=%s max_hours=%d",
                        subtask_id,
                        oldest.isoformat() if oldest else "-",
                        PAGE_MAX_TWEET_AGE_HOURS,
                    )
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
            logger.exception("task failed | subtask=%s error=%s", subtask_id, e)
            return {
                "type": "task_result",
                "assignment_id": assignment_id,
                "subtask_id": subtask_id,
                "status": "failed",
                "error": str(e),
                "cookie_status": CookieStatus.ERROR.value,
                "_tweets_fetched_raw": tweets_fetched_raw,
            }

        logger.info(
            "task done | subtask=%s pages=%d raw=%d fresh=%d reason=%s",
            subtask_id, pages_fetched, tweets_fetched_raw, len(all_fresh),
            stopped_reason or "complete",
        )
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
