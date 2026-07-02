"""将 twikit 推文打包为 Twitter API v2 兼容结构（供 all_tweets.content 备份）。

下游（tiptag-server / tagai-api）约定：
- JSON.parse(content) 后读取 data.text、data.id、includes.users
- getAuthor() 通过 data.author_id 在 includes.users 中匹配作者
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Optional


def _str_id(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def _iso_time(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val if val.tzinfo else val.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    s = str(val).strip()
    if not s:
        return None
    if s.endswith("Z") or "+" in s:
        return s
    return s


def _int_metric(user: Any, *names: str) -> int:
    for name in names:
        val = getattr(user, name, None)
        if val is None:
            continue
        try:
            return int(val)
        except (TypeError, ValueError):
            continue
    return 0


def pack_twitter_api_user(user: Any) -> dict:
    """includes.users 条目，对齐 Twitter API v2 User 对象。"""
    username = (
        getattr(user, "screen_name", None)
        or getattr(user, "username", None)
        or ""
    )
    profile = (
        getattr(user, "profile_image_url_https", None)
        or getattr(user, "profile_image_url", None)
        or ""
    )
    verified = bool(
        getattr(user, "is_blue_verified", False)
        or getattr(user, "verified", False)
    )
    return {
        "id": _str_id(getattr(user, "id", None)),
        "name": (getattr(user, "name", None) or "").strip(),
        "username": str(username).strip(),
        "created_at": _iso_time(getattr(user, "created_at", None)),
        "profile_image_url": str(profile).strip(),
        "public_metrics": {
            "followers_count": _int_metric(user, "followers_count"),
            "following_count": _int_metric(user, "following_count", "friends_count"),
            "tweet_count": _int_metric(user, "statuses_count", "tweet_count"),
            "listed_count": _int_metric(user, "listed_count"),
            "like_count": _int_metric(user, "favourites_count", "favorite_count", "like_count"),
            "media_count": _int_metric(user, "media_count"),
        },
        "verified": verified,
    }


def _pack_entities(tweet: Any) -> dict:
    entities = getattr(tweet, "entities", None)
    if isinstance(entities, dict):
        return entities
    out: dict[str, list] = {}
    for key in ("hashtags", "mentions", "urls", "cashtags", "symbols"):
        val = getattr(entities, key, None) if entities is not None else None
        if val is None and isinstance(entities, dict):
            val = entities.get(key)
        if val:
            out[key] = list(val) if not isinstance(val, list) else val
    return out


def _referenced_tweets(tweet: Any) -> list[dict]:
    refs: list[dict] = []
    reply_id = getattr(tweet, "in_reply_to_status_id", None) or getattr(tweet, "reply_to", None)
    if reply_id:
        refs.append({"type": "replied_to", "id": _str_id(reply_id)})
    quote_id = getattr(tweet, "quoted_status_id", None) or getattr(tweet, "quote_tweet_id", None)
    if quote_id:
        refs.append({"type": "quoted", "id": _str_id(quote_id)})
    retweet_id = getattr(tweet, "retweeted_status_id", None)
    if retweet_id:
        refs.append({"type": "retweeted", "id": _str_id(retweet_id)})
    return refs


def pack_twitter_api_payload(tweet: Any, user: Any = None) -> dict:
    """完整 { data, includes }，可直接 JSON.stringify 写入 all_tweets.content。"""
    user = user if user is not None else getattr(tweet, "user", None)
    tweet_id = _str_id(getattr(tweet, "id", None))
    author_id = _str_id(getattr(user, "id", None) if user is not None else getattr(tweet, "author_id", None))
    text = (getattr(tweet, "text", None) or getattr(tweet, "full_text", None) or "").strip()
    conversation_id = _str_id(
        getattr(tweet, "conversation_id", None)
        or getattr(tweet, "in_reply_to_status_id", None)
        or tweet_id
    ) or tweet_id

    data: dict[str, Any] = {
        "id": tweet_id,
        "text": text,
        "author_id": author_id,
        "conversation_id": conversation_id,
        "created_at": _iso_time(getattr(tweet, "created_at", None)),
        "edit_history_tweet_ids": [tweet_id] if tweet_id else [],
        "entities": _pack_entities(tweet),
        "geo": {},
        "article": {},
        "attachments": {},
    }
    refs = _referenced_tweets(tweet)
    if refs:
        data["referenced_tweets"] = refs

    includes: dict[str, Any] = {"users": [], "tweets": []}
    if user is not None:
        includes["users"].append(pack_twitter_api_user(user))

    return {"data": data, "includes": includes}
