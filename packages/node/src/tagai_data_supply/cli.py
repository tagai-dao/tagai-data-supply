"""一键化 CLI：setup / run / status。spec §11。"""
from __future__ import annotations
import asyncio
import json
import urllib.request
import urllib.error

import click

from .config import NodeConfig, ensure_config_dir
from .cookie import save_cookie, load_cookie
from .node_state import save_state, load_state
from .client.protocol import CookieStatus
from .client.ws import NodeClient
from .runtime.executor import TaskExecutor
from .scraper.twikit_scraper import TwikitScraper
from .runtime_store import (
    load_manifest, save_manifest, write_status, read_status, build_status_snapshot,
)
from .setup_wizard import run_setup
from .registration import register_with_relayer, local_timezone as _local_timezone
from .task_gate import TaskGate
from .social_simulator import SocialSimulator
from . import social_state, interaction_pool


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
@click.option("--tagai-account-type", type=click.Choice(['0', '2']), prompt="账号类型 (0=twitter, 2=tagclaw)")
@click.option("--label", default=None)
def configure(http_base: str, invite_secret: str, tagai_username: str,
              tagai_account_type: str, label: str | None):
    """（进阶）非交互注册。推荐使用 `tagai-node setup`。"""
    click.echo("提示：推荐使用 `tagai-node setup`，会引导填写抓取 cookie。")
    ensure_config_dir()
    tz = _local_timezone()
    username = tagai_username.strip().removeprefix("@")
    cred = register_with_relayer(http_base, invite_secret, tz, label=label,
                                 tagai_username=username,
                                 tagai_account_type=int(tagai_account_type))
    ws_url = http_base.replace("http://", "ws://").replace("https://", "wss://")
    save_state(NodeConfig(relayer_url=ws_url, node_token=cred["node_token"], timezone=tz))
    click.echo(f"注册成功: node_id={cred['node_id']}。请 `tagai-node login` 后 `run`。")


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
def run():
    """常驻运行：WS 连接 → 领任务 → 抓取 → 回传。"""
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

    client = NodeClient(
        relayer_url=cfg.relayer_url,
        node_token=cfg.node_token,
        timezone=cfg.timezone,
        cookie_status=cookie_status,
        on_task=on_task,
        on_auth_change=_on_auth,
        task_gate=gate,
    )

    async def _run_with_status():
        write_status(build_status_snapshot(
            phase="starting", manifest=manifest, cookie_configured=True, relayer_connected=False,
        ))
        sim_task = asyncio.create_task(social.run_loop())
        try:
            await client.run()
        finally:
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

    click.echo(f"运行中（relayer={cfg.relayer_url}, tz_offset=UTC{tz_offset:+d}）")
    try:
        asyncio.run(_run_with_status())
    except KeyboardInterrupt:
        click.echo("停止中...")
        client.stop()
        write_status(build_status_snapshot(
            phase="stopped", manifest=manifest, cookie_configured=True, relayer_connected=False,
        ))


def _make_handler(executor: TaskExecutor, gate: TaskGate, scraper: TwikitScraper):
    from . import interaction_pool

    async def handler(task: dict) -> dict:
        write_status({"current_subtask_id": task.get("subtask_id"), "current_assignment_id": task.get("assignment_id")})
        result = await executor.handle(task)
        raw = int(result.pop("_tweets_fetched_raw", 0))
        gate.on_task_completed(raw)
        # 养号池：存入本批抓到的推文（含 content）
        if result.get("tweets"):
            interaction_pool.add_tweets(result["tweets"])
        write_status({"last_task_status": result.get("status"), "pages_fetched": result.get("pages_fetched")})
        return result
    return handler


def main():
    cli()


if __name__ == "__main__":
    main()
