import os
from pathlib import Path

from tagai_data_supply.node_logging import (
    setup_node_logging,
    write_pid,
    read_pid,
    clear_pid,
    is_process_alive,
    tail_log_file,
)
from tagai_data_supply.status_reporter import build_status_broadcast


def test_setup_node_logging_writes_file(tmp_path, monkeypatch):
    log_file = tmp_path / "node.log"
    setup_node_logging(log_file=log_file, console=False)
    logging = __import__("logging")
    log = logging.getLogger("tagai_data_supply")
    log.info("hello log")
    for h in log.handlers:
        h.flush()
    assert log_file.exists()
    assert "hello log" in log_file.read_text()


def test_pid_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr("tagai_data_supply.node_logging.PID_FILE", tmp_path / "node.pid")
    write_pid(12345)
    assert read_pid() == 12345
    clear_pid()
    assert read_pid() is None


def test_is_process_alive():
    assert is_process_alive(os.getpid())


def test_tail_log_file(tmp_path, capsys):
    p = tmp_path / "node.log"
    p.write_text("line1\nline2\nline3\n")
    tail_log_file(p, lines=2, follow=False)
    out = capsys.readouterr().out
    assert "line2" in out
    assert "line3" in out
    assert "line1" not in out


def test_build_status_broadcast_minimal(monkeypatch):
    class Gate:
        def status_snapshot(self):
            return {
                "daily_tweet_count": 10,
                "daily_tweet_limit": 3000,
                "in_quiet_hours": False,
            }

    monkeypatch.setattr(
        "tagai_data_supply.status_reporter.load_manifest",
        lambda: type("M", (), {"node_id": "n1"})(),
    )
    monkeypatch.setattr(
        "tagai_data_supply.status_reporter.read_status",
        lambda: {"relayer_connected": True, "last_task_status": "done"},
    )
    monkeypatch.setattr("tagai_data_supply.status_reporter.interaction_pool.pool_size", lambda: 5)

    msg = build_status_broadcast(gate=Gate(), relayer_connected=True, busy=False)
    assert "status |" in msg
    assert "node=n1" in msg
    assert "today=10/3000" in msg
    assert "pool=5" in msg
    assert "last=done" in msg
