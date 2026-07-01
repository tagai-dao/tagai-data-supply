"""周期性状态播报（默认 5 分钟）。"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Optional

from . import interaction_pool
from .runtime_store import load_manifest, read_status

logger = logging.getLogger(__name__)


def build_status_broadcast(
    *,
    gate: Any,
    relayer_connected: bool,
    busy: bool = False,
) -> str:
    """拼一条人类可读的状态摘要。"""
    manifest = load_manifest()
    snap = read_status()
    gate_snap = gate.status_snapshot() if gate else {}

    node_id = (manifest.node_id if manifest else None) or snap.get("node_id") or "-"
    daily = gate_snap.get("daily_tweet_count", snap.get("daily_tweet_count", 0))
    limit = gate_snap.get("daily_tweet_limit", snap.get("daily_tweet_limit", 3000))
    pool = interaction_pool.pool_size()
    quiet = gate_snap.get("in_quiet_hours", snap.get("in_quiet_hours", False))
    next_after = gate_snap.get("next_accept_after") or snap.get("next_accept_after")
    last_task = snap.get("last_task_status")
    subtask = snap.get("current_subtask_id")

    parts = [
        f"node={node_id}",
        f"ws={'up' if relayer_connected else 'down'}",
        f"busy={'yes' if busy else 'no'}",
        f"today={daily}/{limit}",
        f"pool={pool}",
        f"quiet={'yes' if quiet else 'no'}",
    ]
    if subtask and busy:
        parts.append(f"task={subtask}")
    if last_task:
        parts.append(f"last={last_task}")
    if next_after and not busy:
        parts.append(f"cooldown_until={next_after}")
    return "status | " + " ".join(parts)


async def status_reporter_loop(
    *,
    interval_sec: int,
    gate: Any,
    is_connected: Callable[[], bool],
    is_busy: Callable[[], bool],
    stop_event: asyncio.Event,
) -> None:
    """每隔 interval_sec 打一条 INFO 状态日志。"""
    logger.info("status reporter started (every %ds)", interval_sec)
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_sec)
            break
        except asyncio.TimeoutError:
            msg = build_status_broadcast(
                gate=gate,
                relayer_connected=is_connected(),
                busy=is_busy(),
            )
            logger.info(msg)
