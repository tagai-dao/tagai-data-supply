"""twikit 抓取适配器。spec §2/P2。

twikit 随 Twitter 改版可能失效（spec §16 已知风险），故：
- twikit 懒加载，作为可选依赖（[scraper] extra）
- 抓取方法返回统一 {tweets, next_cursor, cookie_status} 结构
- 失败时降级为 cookie_status=error，由 relayer 决定回收/冷却

注意：twikit 接口随版本变化，以下为参考实现，需在 P2 spike 中按实际 twikit API 调整。
"""
from __future__ import annotations
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TwikitScraper:
    """基于 twikit 的抓取器。cookie 在构造时注入（ct0 + auth_token）。"""

    def __init__(self, ct0: str, auth_token: str):
        self.ct0 = ct0
        self.auth_token = auth_token
        self._client = None  # 懒初始化

    async def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            from twikit import Client  # type: ignore
        except ImportError as e:
            raise RuntimeError("twikit 未安装，请 pip install -e .[scraper]") from e
        client = Client("en-US")
        # twikit 用 cookie 登录
        client.set_cookies({
            "ct0": self.ct0,
            "auth_token": self.auth_token,
        })
        self._client = client
        return client

    async def fetch(self, task_type: str, params: dict, cursor: Optional[str] = None) -> dict:
        client = await self._ensure_client()
        try:
            if task_type == "hashtag":
                return await self._search_hashtag(client, params, cursor)
            elif task_type == "user_timeline":
                return await self._user_timeline(client, params, cursor)
            elif task_type == "keyword":
                return await self._search_keyword(client, params, cursor)
            else:
                return {"tweets": [], "next_cursor": None, "cookie_status": "error"}
        except Exception as e:
            logger.warning("twikit fetch failed: %s", e)
            status = self._classify_error(e)
            return {"tweets": [], "next_cursor": cursor, "cookie_status": status}

    def _classify_error(self, e: Exception) -> str:
        msg = str(e).lower()
        if "rate" in msg or "429" in msg:
            return "rate_limited"
        if "unauthorized" in msg or "401" in msg or "auth" in msg:
            return "auth_failed"
        return "error"

    async def _search_hashtag(self, client, params, cursor):
        q = params.get("q", "")
        # twikit: client.search_tweet(query, product='Latest', cursor=...)
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
        """把 twikit 结果转为统一结构。twikit 返回对象有 .tweets 与 next cursor。"""
        tweets = []
        raw_tweets = getattr(res, "tweets", None) or []
        for t in raw_tweets:
            tweets.append({
                "tweet_id": getattr(t, "id", None),
                "twitter_id": getattr(getattr(t, "user", None), "id", None),
                "content": getattr(t, "text", "") or getattr(t, "full_text", ""),
                "tweet_time": getattr(t, "created_at", None),
                "tags": None,
                "video_link": None,
            })
        next_cursor = getattr(res, "next_cursor", None)
        return {"tweets": tweets, "next_cursor": next_cursor, "cookie_status": "ok"}
