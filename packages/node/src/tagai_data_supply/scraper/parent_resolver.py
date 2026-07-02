"""回复父帖解析：搜索嵌套优先，缺失时限量 get_tweet_by_id。"""
from __future__ import annotations
import json
import logging
from typing import Any, Optional, Protocol

from .twitter_api_payload import pack_twitter_api_payload, pack_twitter_api_user

logger = logging.getLogger(__name__)


class TweetFetcher(Protocol):
    async def get_tweet_by_id(self, tweet_id: str) -> Any:
        ...


def _str_id(val: Any) -> str:
    return str(val).strip() if val is not None else ""


def extract_embedded_parent(tweet: Any) -> Optional[Any]:
    """从 twikit 嵌套对象取直接父帖（in_reply_to / reply 对象）。"""
    for attr in ("in_reply_to_status", "reply_to_status", "parent_tweet", "replied_to_status"):
        parent = getattr(tweet, attr, None)
        if parent is not None and getattr(parent, "id", None):
            return parent
    return None


def pack_parent_bundle(parent_tweet: Any) -> dict:
    user = getattr(parent_tweet, "user", None)
    author = pack_twitter_api_user(user) if user is not None else {}
    payload = pack_twitter_api_payload(parent_tweet, user)
    text = (getattr(parent_tweet, "text", None) or getattr(parent_tweet, "full_text", None) or "").strip()
    return {
        "parent_tweet_id": _str_id(getattr(parent_tweet, "id", None)),
        "parent_twitter_id": _str_id(getattr(user, "id", None) if user else getattr(parent_tweet, "author_id", None)),
        "parent_content": text,
        "parent_tweet_time": getattr(parent_tweet, "created_at", None),
        "parent_raw_payload": payload,
        "parent_twitter_username": author.get("username"),
        "parent_twitter_name": author.get("name"),
        "parent_profile": author.get("profile_image_url"),
        "parent_followers": (author.get("public_metrics") or {}).get("followers_count"),
        "parent_followings": (author.get("public_metrics") or {}).get("following_count"),
        "parent_tweet_count": (author.get("public_metrics") or {}).get("tweet_count"),
        "parent_like_count": (author.get("public_metrics") or {}).get("like_count"),
        "parent_listed_count": (author.get("public_metrics") or {}).get("listed_count"),
        "parent_verified": author.get("verified"),
    }


class ParentTweetResolver:
    """单任务内父帖解析：dedup + 限量 API 补拉。"""

    def __init__(self, fetcher: TweetFetcher, max_fetches: int = 5):
        self.fetcher = fetcher
        self.max_fetches = max_fetches
        self._resolved: dict[str, dict] = {}
        self._fetch_count = 0

    async def resolve(self, reply_tweet: Any) -> Optional[dict]:
        parent_id = _str_id(getattr(reply_tweet, "in_reply_to_status_id", None) or getattr(reply_tweet, "reply_to", None))
        if not parent_id:
            return None

        if parent_id in self._resolved:
            return self._resolved[parent_id]

        embedded = extract_embedded_parent(reply_tweet)
        if embedded is not None:
            bundle = pack_parent_bundle(embedded)
            self._resolved[parent_id] = bundle
            return bundle

        if self._fetch_count >= self.max_fetches:
            logger.info("parent fetch cap reached (%d), skip parent_id=%s", self.max_fetches, parent_id)
            return None

        try:
            self._fetch_count += 1
            fetched = await self.fetcher.get_tweet_by_id(parent_id)
            if fetched is None:
                return None
            bundle = pack_parent_bundle(fetched)
            self._resolved[parent_id] = bundle
            return bundle
        except Exception as e:
            logger.warning("get_tweet_by_id failed parent_id=%s err=%s", parent_id, e)
            return None
