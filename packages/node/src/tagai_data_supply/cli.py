"""一键化 CLI：configure / login / run。spec §11。"""
from __future__ import annotations
import asyncio
import json
import urllib.request
import urllib.error
from pathlib import Path

import click

from .config import NodeConfig, ensure_config_dir
from .cookie import save_cookie, load_cookie
from .node_state import save_state, load_state
from .client.protocol import PROTOCOL_VERSION, RegisterRequest, RegisterResponse, CookieStatus
from .client.ws import NodeClient
from .runtime.executor import TaskExecutor
from .scraper.twikit_scraper import TwikitScraper


def _local_timezone() -> str:
    try:
        import time
        import zoneinfo  # py3.9+
        local = time.localtime().tm_zone
        # 退化处理：取不到就用 UTC
        return local if local else "UTC"
    except Exception:
        return "UTC"


def register_with_relayer(http_base: str, invite_secret: str, timezone: str,
                          label: str | None = None,
                          tagai_account: str | None = None,
                          tagai_account_type: int | None = None) -> dict:
    """调用 relayer POST /node/register，返回 {node_id, node_token, protocol_version}。spec §10.1。"""
    req_body = RegisterRequest(
        invite_secret=invite_secret,
        protocol_version=PROTOCOL_VERSION,
        timezone=timezone,
        label=label,
        tagai_account=tagai_account,
        tagai_account_type=tagai_account_type,
    ).model_dump(exclude_none=True)
    url = http_base.rstrip("/") + "/node/register"
    data = json.dumps(req_body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    # 禁用系统代理（macOS urllib 会读系统代理设置导致本地请求被代理 502）
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise click.ClickException(f"register failed: HTTP {e.code} {detail}")
    parsed = RegisterResponse.model_validate(body)
    if parsed.c != 0 or not parsed.d:
        raise click.ClickException(f"register failed: {parsed.m}")
    return parsed.d


@click.group()
def cli():
    """tagai-data-supply 节点 CLI。"""


@cli.command()
@click.option("--http-base", prompt="Relayer HTTP 地址", help="relayer http base，如 http://host:7701")
@click.option("--invite-secret", prompt="Invite secret", hide_input=True, help="一次性 invite secret")
@click.option("--tagai-account", prompt="绑定的 tagai 账号 twitter_id", help="已绑 steem 的 tagai 账号")
@click.option("--tagai-account-type", type=click.Choice(['0', '2']), prompt="账号类型 (0=twitter, 2=tagclaw)")
@click.option("--label", default=None, help="节点标签")
def configure(http_base: str, invite_secret: str, tagai_account: str,
              tagai_account_type: str, label: str | None):
    """配置并注册节点（用 invite 换 node_token，存本地）。spec §10.1。"""
    ensure_config_dir()
    tz = _local_timezone()
    click.echo(f"注册中（timezone={tz}, 验证 tagai 账号 {tagai_account}）...")
    cred = register_with_relayer(http_base, invite_secret, tz, label=label,
                                 tagai_account=tagai_account,
                                 tagai_account_type=int(tagai_account_type))
    # http base -> ws url
    ws_url = http_base.replace("http://", "ws://").replace("https://", "wss://")
    cfg = NodeConfig(relayer_url=ws_url, node_token=cred["node_token"], timezone=tz)
    save_state(cfg)
    click.echo(f"注册成功: node_id={cred['node_id']}")
    click.echo(f"状态已保存。运行 `tagai-node run` 开始抓取。")


@cli.command()
@click.option("--ct0", prompt="ct0", hide_input=True)
@click.option("--auth-token", prompt="auth_token", hide_input=True)
def login(ct0: str, auth_token: str):
    """交互式输入 cookie（ct0 / auth_token），存本地。spec §11。"""
    ensure_config_dir()
    save_cookie(ct0, auth_token)
    click.echo("cookie 已保存（权限 0600）。")


@cli.command()
def run():
    """常驻运行：WS 连接 → 鉴权 → 心跳 → 领任务 → 抓取 → 回传。spec §11。"""
    cfg = load_state()
    if not cfg or not cfg.node_token:
        raise click.ClickException("未注册，请先运行 `tagai-node configure`")
    ck = load_cookie()
    cookie_status = CookieStatus.OK if ck else CookieStatus.UNKNOWN
    if not ck:
        click.echo("警告：未检测到 cookie，请运行 `tagai-node login`（当前仅待命）")

    # 建抓取器 + 执行器（spec §2/P2）
    on_task = None
    if ck:
        scraper = TwikitScraper(ct0=ck["ct0"], auth_token=ck["auth_token"])
        executor = TaskExecutor(scraper)
        on_task = _make_handler(executor)

    client = NodeClient(
        relayer_url=cfg.relayer_url,
        node_token=cfg.node_token,
        timezone=cfg.timezone,
        cookie_status=cookie_status,
        on_task=on_task,
    )
    click.echo(f"运行中（relayer={cfg.relayer_url}, tz={cfg.timezone}）")
    try:
        asyncio.run(client.run())
    except KeyboardInterrupt:
        click.echo("停止中...")
        client.stop()


def _make_handler(executor: TaskExecutor):
    async def handler(task: dict) -> dict:
        return await executor.handle(task)
    return handler


def main():
    cli()


if __name__ == "__main__":
    main()
