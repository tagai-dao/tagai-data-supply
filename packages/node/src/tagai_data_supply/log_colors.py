"""终端日志着色（文件日志保持纯文本）。"""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Optional

# ANSI 颜色
_RESET = "\033[0m"
_DIM = "\033[2m"
_COLORS = {
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "blue": "\033[34m",
    "magenta": "\033[35m",
    "cyan": "\033[36m",
    "white": "\033[37m",
    "bright_green": "\033[92m",
    "bright_cyan": "\033[96m",
    "bright_white": "\033[97m",
}

_LEVEL_COLORS = {
    logging.DEBUG: "white",
    logging.WARNING: "yellow",
    logging.ERROR: "red",
    logging.CRITICAL: "red",
}

# 按消息语义着色（INFO 默认白色）
_INFO_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"task failed|task declined|post failed|social sim tick failed", re.I), "red"),
    (re.compile(r"task page stale", re.I), "yellow"),
    (re.compile(r"task received|task reported|task handling|task finished", re.I), "cyan"),
    (re.compile(r"task start|task page|task done", re.I), "green"),
    (re.compile(r"ws connected|relayer connected", re.I), "bright_green"),
    (re.compile(r"ws disconnected|ws reconnect|relayer disconnected", re.I), "yellow"),
    (re.compile(r"^status \|", re.I), "blue"),
    (re.compile(r"social simulator|posted tweet|post skipped", re.I), "magenta"),
    (re.compile(r"node starting|node stopped|node interrupted|status reporter", re.I), "bright_white"),
    (re.compile(r"ws ", re.I), "bright_cyan"),
]

_ANSI_RE = re.compile(r"\033\[[0-9;]*m")


def use_color(stream=None) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    stream = stream or sys.stdout
    return hasattr(stream, "isatty") and bool(stream.isatty())


def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def _wrap(color: str, text: str, enabled: bool) -> str:
    if not enabled or color not in _COLORS:
        return text
    return f"{_COLORS[color]}{text}{_RESET}"


def message_color(level: int, message: str) -> str:
    if level >= logging.ERROR:
        return "red"
    if level >= logging.WARNING:
        return "yellow"
    if level <= logging.DEBUG:
        return "white"
    for pattern, color in _INFO_RULES:
        if pattern.search(message):
            return color
    return "white"


def colorize_log_line(line: str, *, enabled: Optional[bool] = None) -> str:
    """为 `tagai-node logs` 输出的单行日志着色。"""
    enabled = use_color() if enabled is None else enabled
    if not enabled or not line.strip():
        return line

    # 解析: 2026-07-01 15:35:08 [INFO] tagai_data_supply.client.ws: task received | ...
    m = re.match(
        r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] ([^:]+): (.*)$",
        line.rstrip("\n"),
    )
    if not m:
        return line

    ts, level_name, logger_name, message = m.groups()
    level = getattr(logging, level_name, logging.INFO)
    msg_color = message_color(level, message)
    level_color = _LEVEL_COLORS.get(level, "white")

    ts_part = _wrap("white", ts, enabled)
    if enabled:
        ts_part = f"{_DIM}{ts_part}{_RESET}"
    level_part = _wrap(level_color, f"[{level_name}]", enabled)
    name_part = _wrap("white", logger_name, enabled)
    if enabled:
        name_part = f"{_DIM}{name_part}{_RESET}"
    msg_part = _wrap(msg_color, message, enabled)
    return f"{ts_part} {level_part} {name_part}: {msg_part}\n"


class ColoredConsoleFormatter(logging.Formatter):
    """控制台彩色 Formatter；文件 handler 仍用普通 Formatter。"""

    def __init__(self, *, use_color: bool = True):
        super().__init__(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        self._use_color = use_color

    def format(self, record: logging.LogRecord) -> str:
        plain = super().format(record)
        if not self._use_color:
            return plain
        return colorize_log_line(plain + "\n", enabled=True).rstrip("\n")
