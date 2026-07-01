"""交互式 setup 向导：分步校验，全部通过才注册。"""
from __future__ import annotations
import urllib.error
import urllib.request

import click

from .registration import register_with_relayer, verify_tagai_account, local_timezone as _local_timezone
from .config import ensure_config_dir
from .cookie import save_cookie
from .node_state import save_state, load_state
from .config import NodeConfig
from .runtime_store import Manifest, save_manifest, write_status, build_status_snapshot


def _normalize_username(raw: str) -> str:
    return raw.strip().removeprefix("@").strip()


def _ping_relayer(http_base: str) -> bool:
    url = http_base.rstrip("/") + "/health"
    req = urllib.request.Request(url, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=10) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def run_setup(*, http_base: str | None = None, invite_secret: str | None = None,
              run_after: bool = False) -> None:
    """完整 setup：relayer → invite → 收益账号 → 抓取 cookie → 注册。"""
    ensure_config_dir()
    click.echo("=== TagAI 数据节点配置 ===\n")
    click.echo("说明：")
    click.echo("  · 【收益账号】= 您在 TagAI 上已绑 Steem 的账号，用于接收节点策展/挖矿收益")
    click.echo("  · 【抓取账号】= 仅用于 Twitter 抓取的 cookie，建议用小号，与收益账号分开\n")

    click.echo("  · 【静默时段】本地 0:00–8:00 不接收任务，由 Node 时区偏移控制\n")

    # 时区偏移（Node 自主管理，Relayer 不参与）
    while True:
        raw = click.prompt("时区 UTC 偏移（东八区填 8）", default="8")
        try:
            tz_offset = int(str(raw).strip())
            if -12 <= tz_offset <= 14:
                break
        except ValueError:
            pass
        click.echo("请输入 -12 到 14 之间的整数。", err=True)

    # 1. Relayer
    while True:
        base = http_base or click.prompt("Relayer HTTP 地址（如 http://host:7701）")
        base = base.strip().rstrip("/")
        if _ping_relayer(base):
            http_base = base
            break
        click.echo("无法连接 Relayer，请检查地址与网络。", err=True)

    # 2. Invite
    while True:
        secret = invite_secret or click.prompt("Invite secret", hide_input=True)
        if secret.strip():
            invite_secret = secret.strip()
            break
        click.echo("邀请码不能为空。", err=True)

    # 3. 收益账号（输入 username 后后台验证，类型从 TagAI 库读取）
    acct_type = 0
    while True:
        username = _normalize_username(click.prompt("收益账号 Twitter 用户名（@ 可省略）"))
        if not username:
            click.echo("用户名不能为空。", err=True)
            continue
        click.echo("正在验证收益账号（需已在 TagAI 注册并绑定 Steem）...")
        try:
            info = verify_tagai_account(http_base, username)
            acct_type = int(info["account_type"])
            verified_name = info.get("twitter_username") or username
            type_label = "TagClaw Agent" if acct_type == 2 else "Twitter"
            click.echo(f"✓ 收益账号 @{verified_name} 验证通过（{type_label}，已绑 Steem）")
            username = verified_name
            break
        except click.ClickException as e:
            click.echo(str(e), err=True)
            click.echo("请重新输入收益账号。\n", err=True)

    # 4. 抓取 cookie
    click.echo("\n【抓取账号 cookie】")
    click.echo("  建议使用不常登录的小号，不要用上面的收益账号，以降低封号风险。")
    while True:
        ct0 = click.prompt("ct0", hide_input=True)
        auth_token = click.prompt("auth_token", hide_input=True)
        if ct0.strip() and auth_token.strip():
            break
        click.echo("cookie 必填才能抓取，请重新输入。", err=True)

    tz = _local_timezone()
    click.echo(f"\n注册中（timezone={tz}, 收益账号=@{username}）...")
    try:
        cred = register_with_relayer(
            http_base, invite_secret, tz,
            tagai_username=username,
        )
    except click.ClickException as e:
        click.echo(str(e), err=True)
        write_status(build_status_snapshot(phase="setup_failed", extra={"last_error": str(e)}))
        raise SystemExit(1) from e

    ws_url = http_base.replace("http://", "ws://").replace("https://", "wss://")
    save_state(NodeConfig(relayer_url=ws_url, node_token=cred["node_token"], timezone=tz))
    save_cookie(ct0.strip(), auth_token.strip())
    save_manifest(Manifest(
        node_id=cred["node_id"],
        relayer_http=http_base,
        relayer_url=ws_url,
        tagai_username=username,
        tagai_account_type=int(acct_type),
        timezone=tz,
        tz_offset=tz_offset,
        configured_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        social_sim_enabled=True,
    ))
    write_status(build_status_snapshot(
        phase="stopped",
        cookie_configured=True,
        extra={"node_id": cred["node_id"]},
    ))

    click.echo(f"\n注册成功: node_id={cred['node_id']}")
    click.echo("运行 `tagai-node run` 开始抓取。")

    if run_after:
        click.echo("请运行: tagai-node run")
