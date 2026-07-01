"""twikit 抓取适配器。spec §2/P2。

twikit 随 Twitter 改版可能失效（spec §16 已知风险），故：
- twikit 懒加载，作为可选依赖（[scraper] extra）
- 抓取/养号方法返回统一结构
- api_lock 保证抓取与养号互斥
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TwikitScraper:
    """基于 twikit 的抓取器 + 养号动作（cookie 在构造时注入）。"""

    def __init__(self, ct0: str, auth_token: str):
        self.ct0 = ct0
        self.auth_token = auth_token
        self._client = None
        self.api_lock = asyncio.Lock()

    async def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            from twikit import Client  # type: ignore
        except ImportError as e:
            raise RuntimeError("twikit 未安装，请 pip install -e .[scraper]") from e
        client = Client("en-US")
        client.set_cookies({"ct0": self.ct0, "auth_token": self.auth_token})
        self._client = client
        return client

    async def fetch(self, task_type: str, params: dict, cursor: Optional[str] = None) -> dict:
        async with self.api_lock:
            client = await self._ensure_client()
            try:
                if task_type == "hashtag":
                    return await self._search_hashtag(client, params, cursor)
                if task_type == "user_timeline":
                    return await self._user_timeline(client, params, cursor)
                if task_type == "keyword":
                    return await self._search_keyword(client, params, cursor)
                return {"tweets": [], "next_cursor": None, "cookie_status": "error"}
            except Exception as e:
                logger.warning("twikit fetch failed: %s", e)
                return {"tweets": [], "next_cursor": cursor, "cookie_status": self._classify_error(e)}

    async def fetch_home_timeline(self, limit: int = 20) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                res = await self._call_home_timeline(client, limit)
                return self._pack(res)
            except Exception as e:
                logger.warning("home timeline failed: %s", e)
                return {"tweets": [], "cookie_status": self._classify_error(e)}

    async def like_tweet(self, tweet_id: str) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                await self._call_favorite(client, tweet_id)
                return {"ok": True, "cookie_status": "ok"}
            except Exception as e:
                logger.warning("like failed: %s", e)
                return {"ok": False, "error": str(e), "cookie_status": self._classify_error(e)}

    async def create_tweet(self, text: str) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                await self._call_create_tweet(client, text)
                return {"ok": True, "cookie_status": "ok"}
            except Exception as e:
                logger.warning("create_tweet failed: %s", e)
                return {"ok": False, "error": str(e), "cookie_status": self._classify_error(e)}

    async def _call_home_timeline(self, client, limit: int):
        if hasattr(client, "get_timeline"):
            return await client.get_timeline(limit=limit)
        if hasattr(client, "home_timeline"):
            return await client.home_timeline(limit=limit)
        raise RuntimeError("twikit client has no home timeline API")

    async def _call_favorite(self, client, tweet_id: str):
        if hasattr(client, "favorite_tweet"):
            return await client.favorite_tweet(tweet_id)
        tweet = await client.get_tweet_by_id(tweet_id)
        if hasattr(tweet, "favorite"):
            return await tweet.favorite()
        raise RuntimeError("twikit client has no favorite API")

    async def _call_create_tweet(self, client, text: str):
        if hasattr(client, "create_tweet"):
            return await client.create_tweet(text)
        if hasattr(client, "tweet"):
            return await client.tweet(text)
        raise RuntimeError("twikit client has no create_tweet API")

    def _classify_error(self, e: Exception) -> str:
        msg = str(e).lower()
        if "rate" in msg or "429" in msg:
            return "rate_limited"
        if "unauthorized" in msg or "401" in msg or "auth" in msg:
            return "auth_failed"
        return "error"

    async def _search_hashtag(self, client, params, cursor):
        q = params.get("q", "")
        res = await client.search_tweet(q, product="Latest", cursor=cursor)
        return self._pack(res)

    async def _search_keyword(self, client, params, cursor):
        q = params.get("q", "")
        res = await client.search_tweet(q, product="Latest", cursor=cursor)
        return self._pack(res)

    async def _user_timeline(self, client, params, cursor):
        username = params.get("username", "")
        user = await client.get_user_by_screen_name(username)
        res = await client.get_tweets(user.id, cursor=cursor)
        return self._pack(res)

    def _pack(self, res) -> dict:
        tweets = []
        raw_tweets = getattr(res, "tweets", None) or []
        if isinstance(res, list):
            raw_tweets = res
        for t in raw_tweets:
            tweets.append({
                "tweet_id": getattr(t, "id", None),
                "twitter_id": getattr(getattr(t, "user", None), "id", None),
                "content": getattr(t, "text", "") or getattr(t, "full_text", ""),
                "tweet_time": getattr(t, "created_at", None),
                "tags": None,
                "video_link": None,
            })
        next_cursor = getattr(res, "next_cursor", None) if not isinstance(res, list) else None
        return {"tweets": tweets, "next_cursor": next_cursor, "cookie_status": "ok"}
