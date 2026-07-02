import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from tagai_data_supply.task_gate import TaskGate, format_decline_recovery, format_recover_duration
from tagai_data_supply.policy_constants import DAILY_TWEET_LIMIT


def test_quiet_hours_utc8_midnight():
    gate = TaskGate(tz_offset=8)
    # UTC 16:00 = 北京时间 00:00
    with patch("tagai_data_supply.task_gate.datetime") as mdt:
        mdt.now.return_value = datetime(2026, 7, 1, 16, 0, tzinfo=timezone.utc)
        mdt.fromisoformat = datetime.fromisoformat
        assert gate.in_quiet_hours() is True


def test_not_quiet_hours_utc8_noon():
    gate = TaskGate(tz_offset=8)
    with patch("tagai_data_supply.task_gate.datetime") as mdt:
        mdt.now.return_value = datetime(2026, 7, 1, 4, 0, tzinfo=timezone.utc)  # 12:00 local
        mdt.fromisoformat = datetime.fromisoformat
        assert gate.in_quiet_hours() is False


def test_decline_during_quiet_hours():
    gate = TaskGate(tz_offset=8)
    with patch("tagai_data_supply.task_gate.datetime") as mdt:
        mdt.now.return_value = datetime(2026, 7, 1, 17, 0, tzinfo=timezone.utc)
        mdt.fromisoformat = datetime.fromisoformat
        ok, reason, recover = gate.check_accept()
        assert ok is False
        assert reason == "quiet_hours"
        assert recover == 7 * 3600  # 01:00 local → 08:00，剩余 7 小时


def test_decline_busy_has_no_recover_seconds():
    gate = TaskGate(tz_offset=8)
    gate.set_busy(True)
    ok, reason, recover = gate.check_accept()
    assert ok is False
    assert reason == "busy"
    assert recover is None
    assert format_decline_recovery(reason, recover) == "after_current_task"


def test_format_recover_duration():
    assert format_recover_duration(45) == "45s"
    assert format_recover_duration(125) == "2m5s"
    assert format_recover_duration(3661) == "1h1m1s"


def test_min_interval_after_task():
    gate = TaskGate(tz_offset=8)
    mem: dict = {}
    gate._load = lambda: dict(mem)
    gate._save = lambda d: mem.update(d)
    with patch("tagai_data_supply.task_gate.datetime") as mdt:
        base = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
        mdt.now.return_value = base
        mdt.fromisoformat = datetime.fromisoformat
        gate.on_task_completed(10)
        ok, reason, recover = gate.check_accept()
        assert ok is False
        assert reason == "min_interval"
        assert recover is not None
        assert recover > 0


def test_daily_quota():
    gate = TaskGate(tz_offset=8)
    mem = {"daily_date": "20260701", "daily_tweet_count": DAILY_TWEET_LIMIT}
    gate._load = lambda: dict(mem)
    with patch("tagai_data_supply.task_gate.datetime") as mdt:
        mdt.now.return_value = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
        mdt.fromisoformat = datetime.fromisoformat
        ok, reason, recover = gate.check_accept()
        assert ok is False
        assert reason == "daily_quota"
        assert recover is not None
        assert recover > 0
