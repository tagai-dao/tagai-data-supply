"""抓取推文池：供养号点赞与发帖摘句。"""
from __future__ import annotations
import json
import random
from typing import Any, Optional

from .runtime_store import RUNTIME_DIR, ensure_config_dir
from .policy_constants import INTERACTION_POOL_MAX, POST_TEXT_MAX_LEN

POOL_FILE = RUNTIME_DIR / "interaction_pool.json"


def _load() -> dict[str, Any]:
    if not POOL_FILE.exists():
        return {"items": []}
    try:
        return json.loads(POOL_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"items": []}


def _save(data: dict[str, Any]) -> None:
    ensure_config_dir()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    POOL_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def add_tweets(tweets: list[dict]) -> None:
    """把任务抓到的推文加入本地池（tweet_id + content）。"""
    if not tweets:
        return
    data = _load()
    items: list[dict] = data.get("items", [])
    seen = {str(x.get("tweet_id")) for x in items}
    for tw in tweets:
        tid = str(tw.get("tweet_id", "")).strip()
        content = str(tw.get("content", "") or "").strip()
        if not tid or tid in seen:
            continue
        items.append({"tweet_id": tid, "content": content})
        seen.add(tid)
    if len(items) > INTERACTION_POOL_MAX:
        items = items[-INTERACTION_POOL_MAX:]
    data["items"] = items
    _save(data)


def pool_size() -> int:
    return len(_load().get("items", []))


def pick_tweet_id_for_like(exclude: set[str]) -> Optional[str]:
    data = _load()
    candidates = [x for x in data.get("items", []) if str(x.get("tweet_id")) not in exclude]
    if not candidates:
        return None
    return str(random.choice(candidates)["tweet_id"])


def pick_text_for_post(min_len: int = 10) -> Optional[str]:
    """从池中随机摘一段文本用于发帖。"""
    data = _load()
    texts = [str(x.get("content", "")).strip() for x in data.get("items", []) if x.get("content")]
    texts = [t for t in texts if len(t) >= min_len]
    if not texts:
        return None
    content = random.choice(texts)
    if len(content) <= POST_TEXT_MAX_LEN:
        return content
    # 随机截取一段，模拟「摘取」
    max_len = min(POST_TEXT_MAX_LEN, len(content))
    start = random.randint(0, max(0, len(content) - max_len))
    excerpt = content[start:start + max_len].strip()
    return excerpt if len(excerpt) >= min_len else content[:POST_TEXT_MAX_LEN]
