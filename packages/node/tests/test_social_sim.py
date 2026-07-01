from datetime import datetime, timezone
from unittest.mock import patch
import pytest

from tagai_data_supply.social_state import schedule_next_post, ensure_daily_like_plan
from tagai_data_supply.policy_constants import POST_INTERVAL_HOURS


def test_schedule_next_post_at_least_30h():
    with patch("tagai_data_supply.social_state._load", return_value={}), \
         patch("tagai_data_supply.social_state._save") as save:
        schedule_next_post(8)
        saved = save.call_args[0][0]
        nxt_dt = datetime.fromisoformat(saved["next_post_at"])
        if nxt_dt.tzinfo is None:
            nxt_dt = nxt_dt.replace(tzinfo=timezone.utc)
        delta = (nxt_dt - datetime.now(timezone.utc)).total_seconds()
        assert delta >= POST_INTERVAL_HOURS * 3600 - 60


def test_daily_like_plan_count():
    mem = {}

    def _load():
        return dict(mem)

    def _save(d):
        mem.clear()
        mem.update(d)

    with patch("tagai_data_supply.social_state._load", _load), \
         patch("tagai_data_supply.social_state._save", _save), \
         patch("tagai_data_supply.social_state.today_key", return_value="20260701"), \
         patch("tagai_data_supply.social_state.random.randint", return_value=3):
        st = ensure_daily_like_plan(8)
        assert st["daily_like_target"] == 3
        assert len(st["scheduled_like_times"]) == 3


@pytest.mark.asyncio
async def test_social_sim_post_skipped_when_pool_empty():
    from tagai_data_supply.social_simulator import SocialSimulator
    from tagai_data_supply.task_gate import TaskGate

    class MockScraper:
        async def create_tweet(self, text):
            return {"ok": True}

    gate = TaskGate(8)
    sim = SocialSimulator(MockScraper(), gate, tz_offset=8, enabled=True)

    with patch("tagai_data_supply.interaction_pool.pick_text_for_post", return_value=None), \
         patch("tagai_data_supply.social_state.mark_post_skipped") as skip:
        await sim._do_post()
        skip.assert_called_once()
