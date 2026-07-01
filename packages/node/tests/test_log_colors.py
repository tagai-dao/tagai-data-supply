import logging

from tagai_data_supply.log_colors import (
    colorize_log_line,
    message_color,
    strip_ansi,
    use_color,
)


def test_message_color_by_semantic():
    assert message_color(logging.INFO, "task received | subtask=x") == "cyan"
    assert message_color(logging.INFO, "task page | subtask=x page=1") == "green"
    assert message_color(logging.INFO, "status | node=n1 ws=up") == "blue"
    assert message_color(logging.WARNING, "ws disconnected") == "yellow"
    assert message_color(logging.ERROR, "task failed") == "red"


def test_colorize_log_line_adds_ansi_when_enabled():
    line = "2026-07-01 15:35:08 [INFO] tagai_data_supply.client.ws: task received | subtask=x\n"
    out = colorize_log_line(line, enabled=True)
    assert "\033[" in out
    assert "task received" in strip_ansi(out)


def test_colorize_log_line_plain_when_disabled():
    line = "2026-07-01 15:35:08 [INFO] tagai_data_supply.client.ws: task received | subtask=x\n"
    out = colorize_log_line(line, enabled=False)
    assert out == line
    assert "\033[" not in out


def test_use_color_respects_no_color(monkeypatch):
    monkeypatch.setenv("NO_COLOR", "1")
    assert use_color() is False
