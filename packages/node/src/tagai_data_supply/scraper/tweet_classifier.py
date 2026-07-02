"""twikit 推文类型分类（对齐主站 twitter.ts 语义）。"""
from __future__ import annotations
from typing import Any


def _text_of(tweet: Any) -> str:
    return (getattr(tweet, "text", None) or getattr(tweet, "full_text", None) or "").strip()


def is_retweet(tweet: Any) -> bool:
    """转推：丢弃，不入库。"""
    if getattr(tweet, "retweeted_status", None) or getattr(tweet, "retweeted_status_id", None):
        return True
    text = _text_of(tweet)
    if text.startswith("RT @") or text.startswith("RT@"):
        return True
    return False


def classify_tweet(tweet: Any) -> str:
    """返回 original | quote | reply | retweet。"""
    if is_retweet(tweet):
        return "retweet"
    if getattr(tweet, "in_reply_to_status_id", None) or getattr(tweet, "in_reply_to_user_id", None):
        return "reply"
    if (
        getattr(tweet, "quoted_status", None)
        or getattr(tweet, "quoted_status_id", None)
        or getattr(tweet, "is_quote_status", False)
    ):
        return "quote"
    return "original"
