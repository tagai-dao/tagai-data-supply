"""养号模拟：随机发帖（30h）+ 点赞（1-5/天）。纯 Node 侧，不经过 Relayer。"""
from __future__ import annotations
import asyncio
import logging
import random
from typing import TYPE_CHECKING, Optional

from .policy_constants import LIKE_SOURCE_TASK_RATIO
from . import interaction_pool
from . import social_state
from .runtime_store import write_status

if TYPE_CHECKING:
    from .scraper.twikit_scraper import TwikitScraper
    from .task_gate import TaskGate

logger = logging.getLogger(__name__)

LOOP_INTERVAL_SEC = 60


class SocialSimulator:
    def __init__(
        self,
        scraper: "TwikitScraper",
        gate: "TaskGate",
        tz_offset: int = 8,
        enabled: bool = True,
    ):
        self.scraper = scraper
        self.gate = gate
        self.tz_offset = tz_offset
        self.enabled = enabled
        self._stop = asyncio.Event()
        self._busy = False

    def stop(self) -> None:
        self._stop.set()

    def _can_act(self) -> bool:
        if not self.enabled:
            return False
        if self.gate.in_quiet_hours():
            return False
        if self.gate._busy or self._busy:
            return False
        if not social_state.in_daytime(self.tz_offset):
            return False
        return True

    async def run_loop(self) -> None:
        if not self.enabled:
            return
        social_state.ensure_daily_like_plan(self.tz_offset)
        if not social_state._load().get("next_post_at"):
            social_state.schedule_next_post(self.tz_offset)
        logger.info("social simulator started (enabled=%s)", self.enabled)
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=LOOP_INTERVAL_SEC)
                break
            except asyncio.TimeoutError:
                pass
            if not self._can_act():
                continue
            try:
                self._busy = True
                if social_state.post_due(self.tz_offset):
                    await self._do_post()
                elif social_state.due_like():
                    await self._do_like()
            except Exception as e:
                logger.warning("social sim tick failed: %s", e)
            finally:
                self._busy = False
                self._write_status()

    async def _do_post(self) -> None:
        text = interaction_pool.pick_text_for_post()
        if not text:
            logger.info("post skipped: interaction pool empty")
            social_state.mark_post_skipped(self.tz_offset)
            return
        result = await self.scraper.create_tweet(text)
        if result.get("ok"):
            logger.info("posted tweet excerpt (%d chars)", len(text))
            social_state.mark_post_success(self.tz_offset)
        else:
            logger.warning("post failed: %s — skip until next cycle", result.get("error"))
            social_state.mark_post_skipped(self.tz_offset)

    async def _do_like(self) -> None:
        exclude = social_state.liked_set()
        tweet_id: Optional[str] = None
        use_pool = random.random() < LIKE_SOURCE_TASK_RATIO
        if use_pool:
            tweet_id = interaction_pool.pick_tweet_id_for_like(exclude)
        if not tweet_id:
            home = await self.scraper.fetch_home_timeline(limit=20)
            if home.get("cookie_status") != "ok":
                logger.warning("home timeline failed: %s", home.get("cookie_status"))
                return
            for tw in home.get("tweets") or []:
                tid = str(tw.get("tweet_id", ""))
                if tid and tid not in exclude:
                    tweet_id = tid
                    break
        if not tweet_id and use_pool:
            # 任务池没命中时 fallback Home
            home = await self.scraper.fetch_home_timeline(limit=20)
            for tw in home.get("tweets") or []:
                tid = str(tw.get("tweet_id", ""))
                if tid and tid not in exclude:
                    tweet_id = tid
                    break
        if not tweet_id:
            logger.debug("like skipped: no candidate tweet")
            return
        result = await self.scraper.like_tweet(tweet_id)
        if result.get("ok"):
            logger.info("liked tweet %s", tweet_id)
            social_state.mark_like_done(tweet_id)
        else:
            logger.warning("like failed: %s", result.get("error"))

    def _write_status(self) -> None:
        snap = social_state.status_snapshot(self.tz_offset)
        snap["social_pool_size"] = interaction_pool.pool_size()
        write_status(snap)

    def status_snapshot(self) -> dict:
        snap = social_state.status_snapshot(self.tz_offset)
        snap["social_sim_enabled"] = self.enabled
        snap["social_pool_size"] = interaction_pool.pool_size()
        return snap
