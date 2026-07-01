"""Node 运行日志与后台进程管理。"""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

from .config import CONFIG_DIR, ensure_config_dir
from .log_colors import ColoredConsoleFormatter, colorize_log_line, use_color
from .runtime_store import RUNTIME_DIR

LOG_DIR = CONFIG_DIR / "logs"
DEFAULT_LOG_FILE = LOG_DIR / "node.log"
PID_FILE = RUNTIME_DIR / "node.pid"

# 统一 logger 命名空间
LOGGER_NAME = "tagai_data_supply"


def setup_node_logging(
    *,
    log_file: Path = DEFAULT_LOG_FILE,
    console: bool = True,
    level: int = logging.INFO,
) -> logging.Logger:
    """配置节点日志：滚动文件 + 可选控制台。"""
    ensure_config_dir()
    log_file.parent.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger(LOGGER_NAME)
    root.setLevel(level)
    root.handlers.clear()
    root.propagate = False

    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    fh = RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8",
    )
    fh.setFormatter(fmt)
    root.addHandler(fh)

    if console:
        ch = logging.StreamHandler(sys.stdout)
        ch.setFormatter(ColoredConsoleFormatter(use_color=use_color(sys.stdout)))
        root.addHandler(ch)

    return root


def read_pid() -> Optional[int]:
    if not PID_FILE.exists():
        return None
    try:
        return int(PID_FILE.read_text().strip())
    except (ValueError, OSError):
        return None


def is_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def write_pid(pid: int) -> None:
    ensure_config_dir()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(pid))
    try:
        os.chmod(PID_FILE, 0o600)
    except OSError:
        pass


def clear_pid() -> None:
    try:
        PID_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def start_daemon(
    *,
    log_file: Path,
    status_interval: int,
    extra_args: list[str] | None = None,
) -> int:
    """后台启动 node run（新会话，日志写入文件）。"""
    pid = read_pid()
    if pid and is_process_alive(pid):
        raise RuntimeError(f"节点已在运行 (pid={pid})")

    cmd = [
        sys.executable, "-m", "tagai_data_supply", "run",
        "--foreground",
        f"--log-file={log_file}",
        f"--status-interval={status_interval}",
    ]
    if extra_args:
        cmd.extend(extra_args)

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    write_pid(proc.pid)
    return proc.pid


def stop_daemon() -> bool:
    """向后台进程发 SIGTERM。返回是否发过信号。"""
    pid = read_pid()
    if not pid:
        return False
    if not is_process_alive(pid):
        clear_pid()
        return False
    os.kill(pid, signal.SIGTERM)
    for _ in range(20):
        if not is_process_alive(pid):
            clear_pid()
            return True
        time.sleep(0.25)
    return True


def tail_log_file(path: Path, *, lines: int = 50, follow: bool = False) -> None:
    """打印日志尾部；follow 时持续输出新行（Ctrl+C 结束）。终端下按语义着色。"""
    if not path.exists():
        print(f"日志文件不存在: {path}")
        return
    color_on = use_color()
    with path.open("r", encoding="utf-8", errors="replace") as f:
        content = f.readlines()
        for line in content[-lines:]:
            print(colorize_log_line(line, enabled=color_on), end="")
        if not follow:
            return
        f.seek(0, os.SEEK_END)
        try:
            while True:
                line = f.readline()
                if line:
                    print(colorize_log_line(line, enabled=color_on), end="", flush=True)
                else:
                    time.sleep(0.3)
        except KeyboardInterrupt:
            print()
