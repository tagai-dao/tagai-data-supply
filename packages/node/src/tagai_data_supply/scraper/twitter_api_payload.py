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


def _user_raw_data(user: Any) -> dict:
    raw = getattr(user, "_data", None)
    return raw if isinstance(raw, dict) else {}


def resolve_user_display_fields(user: Any) -> dict[str, str]:
    """解析作者展示字段；兼容 X 将 name/screen_name 迁至 core 的改版。"""
    username = (
        getattr(user, "screen_name", None)
        or getattr(user, "username", None)
        or ""
    )
    name = getattr(user, "name", None) or ""
    profile = (
        getattr(user, "profile_image_url_https", None)
        or getattr(user, "profile_image_url", None)
        or ""
    )

    if not str(username).strip() or not str(name).strip() or not str(profile).strip():
        raw = _user_raw_data(user)
        core = raw.get("core") or {}
        legacy = raw.get("legacy") or {}
        avatar = raw.get("avatar") or {}
        if not str(username).strip():
            username = core.get("screen_name") or legacy.get("screen_name") or ""
        if not str(name).strip():
            name = core.get("name") or legacy.get("name") or ""
        if not str(profile).strip():
            profile = (
                legacy.get("profile_image_url_https")
                or legacy.get("profile_image_url")
                or avatar.get("image_url")
                or ""
            )

    return {
        "username": str(username).strip(),
        "name": str(name).strip(),
        "profile_image_url": str(profile).strip(),
    }


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
    display = resolve_user_display_fields(user)
    verified = bool(
        getattr(user, "is_blue_verified", False)
        or getattr(user, "verified", False)
    )
    return {
        "id": _str_id(getattr(user, "id", None)),
        "name": display["name"],
        "username": display["username"],
        "created_at": _iso_time(getattr(user, "created_at", None)),
        "profile_image_url": display["profile_image_url"],
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


def pack_quote_retweet_info(tweet: Any) -> tuple[Optional[str], Optional[str]]:
    """引用帖：retweet_info JSON 字符串（对齐 tiptag importTweets）。"""
    import json

    quoted = getattr(tweet, "quoted_status", None)
    quote_id = _str_id(getattr(tweet, "quoted_status_id", None) or getattr(tweet, "quote_tweet_id", None))
    if quoted is None:
        return (quote_id or None), None

    q_user = getattr(quoted, "user", None)
    q_author = pack_twitter_api_user(q_user) if q_user is not None else {}
    q_text = (getattr(quoted, "text", None) or getattr(quoted, "full_text", None) or "").strip()
    q_id = _str_id(getattr(quoted, "id", None)) or quote_id
    info = {
        "id": q_id,
        "text": q_text,
        "createdAt": _iso_time(getattr(quoted, "created_at", None)),
        "author": {
            "id": q_author.get("id") or _str_id(getattr(q_user, "id", None) if q_user else None),
            "name": q_author.get("name"),
            "username": q_author.get("username"),
            "profile_image_url": q_author.get("profile_image_url"),
        },
    }
    return q_id or None, json.dumps(info, ensure_ascii=False)


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

    quoted = getattr(tweet, "quoted_status", None)
    if quoted is not None:
        q_user = getattr(quoted, "user", None)
        q_data = {
            "id": _str_id(getattr(quoted, "id", None)),
            "text": (getattr(quoted, "text", None) or getattr(quoted, "full_text", None) or "").strip(),
            "author_id": _str_id(getattr(q_user, "id", None) if q_user else None),
            "created_at": _iso_time(getattr(quoted, "created_at", None)),
        }
        includes["tweets"].append(q_data)
        if q_user is not None and not any(u.get("id") == q_data["author_id"] for u in includes["users"]):
            includes["users"].append(pack_twitter_api_user(q_user))

    embedded_parent = getattr(tweet, "in_reply_to_status", None) or getattr(tweet, "reply_to_status", None)
    if embedded_parent is not None:
        p_user = getattr(embedded_parent, "user", None)
        includes["tweets"].append({
            "id": _str_id(getattr(embedded_parent, "id", None)),
            "text": (getattr(embedded_parent, "text", None) or getattr(embedded_parent, "full_text", None) or "").strip(),
            "author_id": _str_id(getattr(p_user, "id", None) if p_user else None),
            "created_at": _iso_time(getattr(embedded_parent, "created_at", None)),
        })

    return {"data": data, "includes": includes}
