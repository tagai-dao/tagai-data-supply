"""一键化 CLI：setup / run / status。spec §11。"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import urllib.request
import urllib.error
from pathlib import Path

import click

from .config import NodeConfig, ensure_config_dir
from .cookie import save_cookie, load_cookie
from .node_state import save_state, load_state
from .client.protocol import CookieStatus
from .client.ws import NodeClient
from .runtime.executor import TaskExecutor
from .scraper.twikit_scraper import TwikitScraper
from .scraper_probe import run_scraper_probe, format_probe_report
from .runtime_store import (
    load_manifest, save_manifest, write_status, read_status, build_status_snapshot,
)
from .setup_wizard import run_setup
from .registration import register_with_relayer, verify_tagai_account, local_timezone as _local_timezone
from .task_gate import TaskGate
from .social_simulator import SocialSimulator
from . import social_state, interaction_pool
from .node_logging import (
    DEFAULT_LOG_FILE, setup_node_logging, start_daemon, stop_daemon,
    tail_log_file, read_pid, is_process_alive, clear_pid,
)
from .status_reporter import status_reporter_loop

logger = logging.getLogger(__name__)


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    """tagai-data-supply 抓取节点。"""
    if ctx.invoked_subcommand is None:
        if load_state() and load_manifest():
            click.echo("节点已配置。使用 `tagai-node status` 查看状态，`tagai-node run` 启动。")
        else:
            click.echo("尚未配置，正在进入 setup 向导…")
            ctx.invoke(setup)


@cli.command()
@click.option("--http-base", default=None, help="Relayer HTTP 地址")
@click.option("--invite-secret", default=None, hide_input=True)
@click.option("--run/--no-run", "run_after", default=False, help="配置完成后立即运行")
def setup(http_base: str | None, invite_secret: str | None, run_after: bool):
    """交互式配置：验证通过后注册并保存 cookie。"""
    run_setup(http_base=http_base, invite_secret=invite_secret, run_after=run_after)


@cli.command()
@click.option("--json", "as_json", is_flag=True, help="JSON 输出（供 agent 只读）")
def status(as_json: bool):
    """查看节点状态（只读，不含监控）。"""
    manifest = load_manifest()
    cfg = load_state()
    ck = load_cookie()
    snap = build_status_snapshot(
        phase=read_status().get("phase", "stopped" if cfg else "not_configured"),
        manifest=manifest,
        cookie_configured=bool(ck),
        relayer_connected=read_status().get("relayer_connected", False),
    )
    snap.update({k: v for k, v in read_status().items() if k not in snap})
    if manifest:
        gate = TaskGate(tz_offset=manifest.tz_offset)
        snap.update(gate.status_snapshot())
        snap["social_sim_enabled"] = bool(manifest.social_sim_enabled)
        if manifest.social_sim_enabled:
            snap.update(social_state.status_snapshot(manifest.tz_offset))
            snap["social_pool_size"] = interaction_pool.pool_size()
    if as_json:
        click.echo(json.dumps(snap, ensure_ascii=False, indent=2))
        return
    if not cfg:
        click.echo("未配置。运行 `tagai-node setup`。")
        return
    click.echo(f"节点 ID:     {snap.get('node_id') or '-'}")
    click.echo(f"状态:        {snap.get('phase')}")
    click.echo(f"Relayer:     {snap.get('relayer_http') or '-'}")
    click.echo(f"收益账号:    @{snap.get('tagai_username') or '-'}")
    click.echo(f"Cookie:      {'已配置' if snap.get('cookie_configured') else '未配置'}")
    click.echo(f"WS 已连接:   {'是' if snap.get('relayer_connected') else '否'}")
    off = snap.get("tz_offset")
    if off is not None:
        sign = "+" if int(off) >= 0 else ""
        click.echo(f"时区偏移:    UTC{sign}{off}")
    else:
        click.echo("时区偏移:    -")
    click.echo(f"静默时段:    {'是 (0:00-8:00 不抓取)' if snap.get('in_quiet_hours') else '否'}")
    click.echo(f"今日已抓:    {snap.get('daily_tweet_count', 0)}/{snap.get('daily_tweet_limit', 3000)}")
    if snap.get('next_accept_after'):
        click.echo(f"下次可接:    {snap.get('next_accept_after')}")
    if snap.get("social_sim_enabled"):
        click.echo(f"养号模拟:    开 | 池 {snap.get('social_pool_size', 0)} 条")
        click.echo(f"今日点赞:    {snap.get('daily_likes_done', 0)}/{snap.get('daily_like_target', '-')}")
        if snap.get("next_post_at"):
            click.echo(f"下次发帖:    {snap.get('next_post_at')}")
    else:
        click.echo("养号模拟:    关")


@cli.command("social")
@click.option("--enable/--disable", default=None, help="开启或关闭养号模拟")
def social(enable: bool | None):
    """开关养号模拟（发帖/点赞）。"""
    manifest = load_manifest()
    if not manifest:
        raise click.ClickException("未配置，请先运行 `tagai-node setup`")
    if enable is None:
        state = "开" if manifest.social_sim_enabled else "关"
        click.echo(f"养号模拟当前: {state}。使用 --enable 或 --disable。")
        return
    manifest.social_sim_enabled = enable
    save_manifest(manifest)
    click.echo(f"养号模拟已{'开启' if enable else '关闭'}")


@cli.command("set-timezone")
@click.option("--offset", type=int, required=True, help="UTC 偏移，东八区填 8")
def set_timezone(offset: int):
    """设置 Node 本地时区偏移（用于静默时段 0:00-8:00）。"""
    manifest = load_manifest()
    if not manifest:
        raise click.ClickException("未配置，请先运行 `tagai-node setup`")
    if offset < -12 or offset > 14:
        raise click.ClickException("offset 应在 -12 到 14 之间")
    manifest.tz_offset = offset
    save_manifest(manifest)
    click.echo(f"时区已更新为 UTC{offset:+d}（本地 0:00-8:00 不接收任务）")


@cli.command()
@click.option("--http-base", prompt="Relayer HTTP 地址", help="relayer http base")
@click.option("--invite-secret", prompt="Invite secret", hide_input=True)
@click.option("--tagai-username", prompt="收益账号 Twitter 用户名（@ 可省略）")
@click.option("--label", default=None)
def configure(http_base: str, invite_secret: str, tagai_username: str, label: str | None):
    """（进阶）非交互注册。推荐使用 `tagai-node setup`。"""
    click.echo("提示：推荐使用 `tagai-node setup`，会引导填写抓取 cookie。")
    ensure_config_dir()
    tz = _local_timezone()
    username = tagai_username.strip().removeprefix("@")
    info = verify_tagai_account(http_base, username)
    cred = register_with_relayer(http_base, invite_secret, tz, label=label, tagai_username=info.get("twitter_username") or username)
    ws_url = http_base.replace("http://", "ws://").replace("https://", "wss://")
    save_state(NodeConfig(relayer_url=ws_url, node_token=cred["node_token"], timezone=tz))
    click.echo(f"注册成功: node_id={cred['node_id']}。请 `tagai-node login` 后 `run`。")


@cli.command("test-scraper")
@click.option("--ct0", default=None, help="覆盖本地 cookie 的 ct0")
@click.option("--auth-token", default=None, help="覆盖本地 cookie 的 auth_token")
@click.option("--type", "task_type", default="hashtag",
              type=click.Choice(["hashtag", "keyword", "user_timeline"], case_sensitive=False),
              show_default=True, help="探测用的任务类型")
@click.option("--query", default="#bitcoin", show_default=True, help="hashtag/keyword 查询词")
@click.option("--username", default="", help="user_timeline 时的 Twitter 用户名")
@click.option("--no-home", is_flag=True, help="跳过 Home 时间线探测")
@click.option("--json", "as_json", is_flag=True, help="JSON 输出")
def test_scraper(ct0: str | None, auth_token: str | None, task_type: str,
                 query: str, username: str, no_home: bool, as_json: bool):
    """单独验证 twikit 爬虫与 cookie（不连 Relayer）。"""
    try:
        import twikit  # noqa: F401
    except ImportError as e:
        raise click.ClickException(
            f"Twitter 抓取库未安装。请执行: "
            f"pip uninstall twikit twifork twikit-ng -y && pip install -e \".[scraper]\""
        ) from e

    ck = load_cookie() or {}
    use_ct0 = (ct0 or ck.get("ct0") or "").strip()
    use_token = (auth_token or ck.get("auth_token") or "").strip()
    if not use_ct0 or not use_token:
        raise click.ClickException(
            "缺少 cookie。先运行 `tagai-node login`，或用 --ct0 / --auth-token 传入。"
        )

    scraper = TwikitScraper(ct0=use_ct0, auth_token=use_token)
    report = asyncio.run(run_scraper_probe(
        scraper,
        task_type=task_type,
        query=query,
        username=username,
        include_home=not no_home,
    ))
    cookie_meta = {"ct0": use_ct0, "auth_token": use_token}
    if as_json:
        click.echo(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        click.echo(format_probe_report(report, cookie_meta=cookie_meta))
    if not report.get("ok"):
        raise SystemExit(1)


@cli.command()
@click.option("--ct0", prompt="ct0", hide_input=True)
@click.option("--auth-token", prompt="auth_token", hide_input=True)
def login(ct0: str, auth_token: str):
    """填写抓取账号 cookie（建议用小号，与收益账号分开）。"""
    ensure_config_dir()
    save_cookie(ct0, auth_token)
    write_status(build_status_snapshot(phase="stopped", cookie_configured=True))
    click.echo("抓取 cookie 已保存（权限 0600）。")


@cli.command()
@click.option("-d", "--daemon", is_flag=True, help="后台运行（日志写入文件）")
@click.option("--foreground", is_flag=True, hidden=True, help="内部：daemon 子进程前台运行")
@click.option("--log-file", type=click.Path(), default=None, help="日志文件路径")
@click.option("--status-interval", default=300, show_default=True, help="状态播报间隔（秒）")
def run(daemon: bool, foreground: bool, log_file: str | None, status_interval: int):
    """常驻运行：WS 连接 → 领任务 → 抓取 → 回传。"""
    if daemon and foreground:
        raise click.ClickException("--daemon 与 --foreground 不能同时使用")

    log_path = Path(log_file) if log_file else DEFAULT_LOG_FILE

    if daemon:
        try:
            pid = start_daemon(log_file=log_path, status_interval=status_interval)
        except RuntimeError as e:
            raise click.ClickException(str(e)) from e
        click.echo(f"节点已在后台启动 (pid={pid})")
        click.echo(f"查看日志: tagai-node logs -f")
        click.echo(f"停止节点: tagai-node stop")
        return

    _run_foreground(log_path=log_path, status_interval=status_interval, console=not foreground)


@cli.command()
@click.option("-f", "--follow", is_flag=True, help="持续跟踪新日志（类似 tail -f）")
@click.option("-n", "--lines", default=50, show_default=True, help="显示最近行数")
@click.option("--log-file", type=click.Path(), default=None, help="日志文件路径")
def logs(follow: bool, lines: int, log_file: str | None):
    """查看节点运行日志。"""
    path = Path(log_file) if log_file else DEFAULT_LOG_FILE
    tail_log_file(path, lines=lines, follow=follow)


@cli.command()
def stop():
    """停止后台运行的节点。"""
    pid = read_pid()
    if not pid:
        click.echo("未找到运行中的后台节点。")
        return
    if not is_process_alive(pid):
        clear_pid()
        click.echo("后台节点已退出（已清理 pid 文件）。")
        return
    if stop_daemon():
        click.echo(f"已发送停止信号 (pid={pid})。")
    else:
        click.echo(f"无法停止节点 (pid={pid})。")


def _run_foreground(*, log_path, status_interval: int, console: bool) -> None:
    """前台运行主循环（可被 daemon 子进程调用）。"""
    setup_node_logging(log_file=log_path, console=console)

    cfg = load_state()
    if not cfg or not cfg.node_token:
        raise click.ClickException("未注册，请先运行 `tagai-node setup`")
    ck = load_cookie()
    if not ck:
        raise click.ClickException("未配置抓取 cookie，请运行 `tagai-node setup` 或 `tagai-node login`")

    cookie_status = CookieStatus.OK
    scraper = TwikitScraper(ct0=ck["ct0"], auth_token=ck["auth_token"])
    executor = TaskExecutor(scraper)
    manifest = load_manifest()
    tz_offset = manifest.tz_offset if manifest else 8
    social_enabled = manifest.social_sim_enabled if manifest else True
    gate = TaskGate(tz_offset=tz_offset)
    social = SocialSimulator(scraper, gate, tz_offset=tz_offset, enabled=social_enabled)
    on_task = _make_handler(executor, gate, scraper)

    def _on_auth(connected: bool) -> None:
        write_status(build_status_snapshot(
            phase="running" if connected else "starting",
            manifest=manifest,
            cookie_configured=True,
            relayer_connected=connected,
        ))
        if connected:
            logger.info("relayer connected | url=%s", cfg.relayer_url)
        else:
            logger.info("relayer disconnected")

    client = NodeClient(
        relayer_url=cfg.relayer_url,
        node_token=cfg.node_token,
        timezone=cfg.timezone,
        cookie_status=cookie_status,
        on_task=on_task,
        on_auth_change=_on_auth,
        task_gate=gate,
        tagai_username=manifest.tagai_username if manifest else None,
    )

    async def _run_with_status():
        write_status(build_status_snapshot(
            phase="starting", manifest=manifest, cookie_configured=True, relayer_connected=False,
        ))
        logger.info(
            "node starting | relayer=%s tz_offset=UTC%+d status_interval=%ds",
            cfg.relayer_url, tz_offset, status_interval,
        )
        reporter_stop = asyncio.Event()
        sim_task = asyncio.create_task(social.run_loop())
        reporter_task = asyncio.create_task(status_reporter_loop(
            interval_sec=status_interval,
            gate=gate,
            is_connected=lambda: client.authed,
            is_busy=lambda: gate.is_busy(),
            stop_event=reporter_stop,
        ))
        try:
            await client.run()
        finally:
            reporter_stop.set()
            reporter_task.cancel()
            try:
                await reporter_task
            except asyncio.CancelledError:
                pass
            social.stop()
            sim_task.cancel()
            try:
                await sim_task
            except asyncio.CancelledError:
                pass
            write_status(build_status_snapshot(
                phase="stopped", manifest=manifest, cookie_configured=True,
                relayer_connected=client.authed,
            ))
            logger.info("node stopped")
            if read_pid() == os.getpid():
                clear_pid()

    if console:
        click.echo(f"运行中（relayer={cfg.relayer_url}, tz_offset=UTC{tz_offset:+d}）")
        click.echo(f"日志文件: {log_path}")
    try:
        asyncio.run(_run_with_status())
    except KeyboardInterrupt:
        if console:
            click.echo("停止中...")
        logger.info("node interrupted by user")
        client.stop()
        write_status(build_status_snapshot(
            phase="stopped", manifest=manifest, cookie_configured=True, relayer_connected=False,
        ))
        if read_pid() == os.getpid():
            clear_pid()


def _make_handler(executor: TaskExecutor, gate: TaskGate, scraper: TwikitScraper):
    from . import interaction_pool

    async def handler(task: dict) -> dict:
        subtask_id = task.get("subtask_id")
        logger.info("task handling | subtask=%s", subtask_id)
        write_status({
            "current_subtask_id": subtask_id,
            "current_assignment_id": task.get("assignment_id"),
            "last_error": None,
        })
        result = await executor.handle(task)
        raw = int(result.pop("_tweets_fetched_raw", 0))
        gate.on_task_completed(raw)
        if result.get("tweets"):
            interaction_pool.add_tweets(result["tweets"])
        write_status({
            "last_task_status": result.get("status"),
            "pages_fetched": result.get("pages_fetched"),
            "current_subtask_id": None,
            "current_assignment_id": None,
        })
        logger.info(
            "task finished | subtask=%s status=%s daily_raw=+%d",
            subtask_id, result.get("status"), raw,
        )
        return result
    return handler


def main():
    cli()


if __name__ == "__main__":
    main()
