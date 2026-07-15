"""twikit 抓取适配器。spec §2/P2。

twikit 随 Twitter 改版可能失效（spec §16 已知风险），故：
- twikit 懒加载，作为可选依赖（[scraper] extra）
- 抓取/养号方法返回统一结构
- api_lock 保证抓取与养号互斥
"""
from __future__ import annotations
import asyncio
import logging
import re
from typing import Any, Optional

from .twitter_api_payload import pack_twitter_api_payload, pack_quote_retweet_info, resolve_user_display_fields
from .tweet_classifier import classify_tweet, is_retweet
from .parent_resolver import ParentTweetResolver

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
        import importlib.util
        from ..scraper.twikit_compat import apply_twikit_patches, scraper_install_hint

        if importlib.util.find_spec("twikit") is None:
            raise RuntimeError(
                f"Twitter 抓取库未安装。请执行: {scraper_install_hint()}"
            )
        if importlib.util.find_spec("twikit.client") is None:
            raise RuntimeError(
                "Twitter 抓取库安装不完整（常见于 twifork / twikit 混装）。"
                f"请执行: {scraper_install_hint()}"
            )
        try:
            from twikit import Client  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                f"无法加载 twikit.Client。请执行: {scraper_install_hint()}"
            ) from e
        # 补丁须在 import Client 之后、首次请求之前
        apply_twikit_patches()
        client = Client("en-US")
        client.set_cookies({"ct0": self.ct0, "auth_token": self.auth_token})
        self._client = client
        return client

    async def fetch(self, task_type: str, params: dict, cursor: Optional[str] = None, parent_resolver: Optional[ParentTweetResolver] = None) -> dict:
        try:
            async with self.api_lock:
                client = await self._ensure_client()
                if task_type == "hashtag":
                    res = await self._search_hashtag(client, params, cursor)
                elif task_type == "user_timeline":
                    res = await self._user_timeline(client, params, cursor)
                elif task_type == "keyword":
                    res = await self._search_keyword(client, params, cursor)
                else:
                    return {"tweets": [], "next_cursor": None, "cookie_status": "error"}
            # _pack 可能补拉父帖，须在 api_lock 外执行避免死锁
            return await self._pack(res, parent_resolver)
        except Exception as e:
            detail = self._format_error(e)
            logger.warning("twikit fetch failed: %s", detail)
            return {"tweets": [], "next_cursor": cursor, "cookie_status": self._classify_error(e), "error": detail}

    async def get_tweet_by_id(self, tweet_id: str):
        async with self.api_lock:
            client = await self._ensure_client()
            return await client.get_tweet_by_id(tweet_id)

    async def fetch_home_timeline(self, limit: int = 20) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                res = await self._call_home_timeline(client, limit)
                return await self._pack(res, None)
            except Exception as e:
                detail = self._format_error(e)
                logger.warning("home timeline failed: %s", detail)
                return {"tweets": [], "cookie_status": self._classify_error(e), "error": detail}

    async def like_tweet(self, tweet_id: str) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                await self._call_favorite(client, tweet_id)
                return {"ok": True, "cookie_status": "ok"}
            except Exception as e:
                detail = self._format_error(e)
                logger.warning("like failed: %s", detail)
                return {"ok": False, "error": detail, "cookie_status": self._classify_error(e)}

    async def create_tweet(self, text: str) -> dict:
        async with self.api_lock:
            try:
                client = await self._ensure_client()
                await self._call_create_tweet(client, text)
                return {"ok": True, "cookie_status": "ok"}
            except Exception as e:
                detail = self._format_error(e)
                logger.warning("create_tweet failed: %s", detail)
                return {"ok": False, "error": detail, "cookie_status": self._classify_error(e)}

    async def _call_home_timeline(self, client, limit: int):
        if hasattr(client, "get_timeline"):
            try:
                return await client.get_timeline(count=limit)
            except TypeError:
                # 旧版 twikit 可能用 limit 参数名
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

    def _format_error(self, e: Exception) -> str:
        msg = str(e).strip()
        filename = getattr(e, "filename", None)
        if filename:
            detail = f"{type(e).__name__}: {msg} path={filename!r}"
        elif msg:
            detail = f"{type(e).__name__}: {msg}"
        else:
            detail = f"{type(e).__name__}({repr(e)})"
        return detail

    def _classify_error(self, e: Exception) -> str:
        msg = str(e).lower()
        name = type(e).__name__.lower()
        if isinstance(e, FileNotFoundError) or "no such file" in msg:
            return "runtime_error"
        if "timeout" in msg or "timeout" in name:
            return "network_error"
        if "rate" in msg or "429" in msg:
            return "rate_limited"
        if "unauthorized" in msg or "401" in msg or "auth" in msg or "forbidden" in msg:
            return "auth_failed"
        return "error"

    async def _search_hashtag(self, client, params, cursor):
        q = params.get("q", "")
        # 管理端旧版本会把 cashtag `$TAG` 当作 hashtag 再加一个 `#`，
        # 形成 X 无法匹配的 `#$TAG`。兼容已持久化的历史子任务。
        q = re.sub(r"#\$(?=[A-Za-z0-9_])", "$", q)
        return await client.search_tweet(q, product="Latest", cursor=cursor)

    async def _search_keyword(self, client, params, cursor):
        q = params.get("q", "")
        return await client.search_tweet(q, product="Latest", cursor=cursor)

    async def _user_timeline(self, client, params, cursor):
        username = params.get("username", "")
        user = await client.get_user_by_screen_name(username)
        return await client.get_tweets(user.id, cursor=cursor)

    def _pack_user(self, user) -> dict:
        """从 twikit User 提取 account 表所需字段（对齐 tiptag newUser）。"""
        if user is None:
            return {}

        def _int(*names: str) -> int:
            for name in names:
                val = getattr(user, name, None)
                if val is None:
                    continue
                try:
                    return int(val)
                except (TypeError, ValueError):
                    continue
            return 0

        display = resolve_user_display_fields(user)
        verified = bool(
            getattr(user, "is_blue_verified", False)
            or getattr(user, "verified", False)
        )
        return {
            "twitter_username": display["username"],
            "twitter_name": display["name"],
            "profile": display["profile_image_url"],
            "followers": _int("followers_count"),
            "followings": _int("following_count", "friends_count"),
            "tweet_count": _int("statuses_count"),
            "like_count": _int("favourites_count", "favorite_count"),
            "listed_count": _int("listed_count"),
            "verified": verified,
        }

    def _pack_tweet_metrics(self, tweet) -> dict:
        """帖子互动指标（twikit Tweet.reply_count / view_count）。"""

        def _opt_int(*names: str):
            for name in names:
                val = getattr(tweet, name, None)
                if val is None:
                    continue
                try:
                    return int(val)
                except (TypeError, ValueError):
                    continue
            return None

        return {
            "reply_count": _opt_int("reply_count"),
            "view_count": _opt_int("view_count"),
        }

    async def _pack_single(self, t, parent_resolver: Optional[ParentTweetResolver]) -> Optional[dict]:
        if is_retweet(t):
            return None

        tweet_type = classify_tweet(t)
        if tweet_type == "retweet":
            return None

        user = getattr(t, "user", None)
        author = self._pack_user(user)
        tweet_id = getattr(t, "id", None)
        content = getattr(t, "text", "") or getattr(t, "full_text", "")
        conversation_id = (
            getattr(t, "conversation_id", None)
            or getattr(t, "in_reply_to_status_id", None)
            or tweet_id
        )

        base = {
            "tweet_id": tweet_id,
            "twitter_id": getattr(user, "id", None),
            "content": content,
            "raw_payload": pack_twitter_api_payload(t, user),
            "tweet_time": getattr(t, "created_at", None),
            "conversation_id": conversation_id,
            "tags": None,
            "video_link": None,
            **author,
            **self._pack_tweet_metrics(t),
        }

        if tweet_type == "reply":
            if parent_resolver is None:
                return None
            parent = await parent_resolver.resolve(t)
            if parent is None:
                logger.debug("reply skipped, parent unavailable tweet_id=%s", tweet_id)
                return None
            return {
                **base,
                "kind": "reply",
                "tweet_type": "reply",
                **parent,
            }

        retweet_id, retweet_info = pack_quote_retweet_info(t) if tweet_type == "quote" else (None, None)
        return {
            **base,
            "kind": "post",
            "tweet_type": tweet_type,
            "retweet_id": retweet_id,
            "retweet_info": retweet_info,
        }

    async def _pack(self, res, parent_resolver: Optional[ParentTweetResolver] = None) -> dict:
        tweets = []
        if isinstance(res, list):
            raw_tweets = res
        elif hasattr(res, "__iter__") and not isinstance(res, (str, bytes, dict)):
            raw_tweets = list(res)
        else:
            raw_tweets = getattr(res, "tweets", None) or []
        for t in raw_tweets:
            packed = await self._pack_single(t, parent_resolver)
            if packed is not None:
                tweets.append(packed)
        next_cursor = getattr(res, "next_cursor", None) if not isinstance(res, list) else None
        return {"tweets": tweets, "next_cursor": next_cursor, "cookie_status": "ok"}
