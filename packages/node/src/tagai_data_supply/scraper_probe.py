"""独立验证 twikit 爬虫（不连 Relayer）。"""
from __future__ import annotations
import json
from typing import Any, Optional

from .scraper.twikit_scraper import TwikitScraper


def _mask(s: str, keep: int = 4) -> str:
    s = str(s or "")
    if len(s) <= keep * 2:
        return "*" * len(s)
    return f"{s[:keep]}...{s[-keep:]}"


def _tweet_preview(tweets: list[dict], limit: int = 2) -> list[dict]:
    out = []
    for tw in tweets[:limit]:
        content = str(tw.get("content") or "")
        out.append({
            "tweet_id": tw.get("tweet_id"),
            "twitter_id": tw.get("twitter_id"),
            "content": content[:120] + ("…" if len(content) > 120 else ""),
        })
    return out


async def run_scraper_probe(
    scraper: TwikitScraper,
    *,
    task_type: str = "hashtag",
    query: str = "#bitcoin",
    username: str = "",
    include_home: bool = True,
) -> dict[str, Any]:
    """跑一轮探测：主任务抓取 + 可选 Home 时间线。"""
    params: dict[str, Any] = {}
    if task_type == "user_timeline":
        params = {"username": username or query.lstrip("@")}
    else:
        params = {"q": query}

    report: dict[str, Any] = {
        "task_type": task_type,
        "params": params,
        "checks": {},
    }

    main = await scraper.fetch(task_type, params, None)
    main_tweets = main.get("tweets") or []
    report["checks"]["main_fetch"] = {
        "ok": main.get("cookie_status") == "ok" and len(main_tweets) > 0,
        "cookie_status": main.get("cookie_status"),
        "tweet_count": len(main_tweets),
        "next_cursor": main.get("next_cursor"),
        "error": main.get("error"),
        "sample": _tweet_preview(main_tweets),
    }

    if include_home:
        home = await scraper.fetch_home_timeline(limit=5)
        home_tweets = home.get("tweets") or []
        report["checks"]["home_timeline"] = {
            "ok": home.get("cookie_status") == "ok" and len(home_tweets) > 0,
            "cookie_status": home.get("cookie_status"),
            "tweet_count": len(home_tweets),
            "error": home.get("error"),
            "sample": _tweet_preview(home_tweets),
        }

    checks = report["checks"]
    report["ok"] = any(c.get("ok") for c in checks.values())
    if not report["ok"]:
        statuses = [c.get("cookie_status") for c in checks.values()]
        if any(s == "auth_failed" for s in statuses):
            report["hint"] = "cookie 可能无效或已过期，请在浏览器重新登录 X 后执行 tagai-node login"
        elif any(s == "rate_limited" for s in statuses):
            report["hint"] = "触发 X 限流，稍后再试"
        elif any(s == "network_error" for s in statuses):
            report["hint"] = "访问 X 超时，请检查网络/代理（国内通常需要可访问 x.com 的代理）"
        elif all(
            c.get("cookie_status") == "ok" and c.get("tweet_count", 0) == 0
            for c in checks.values()
        ):
            report["hint"] = (
                "已连上 X 但未解析到推文：检查抓取账号是否受限，或 twikit 需进一步升级"
            )
        else:
            report["hint"] = "twikit 未返回推文，可能是 cookie、网络或 twikit 与 X 接口不兼容"
    else:
        report["hint"] = "爬虫可用，可运行 tagai-node run"
    return report


def format_probe_report(report: dict[str, Any], *, cookie_meta: Optional[dict] = None) -> str:
    lines = ["=== 爬虫探测结果 ==="]
    if cookie_meta:
        lines.append(
            f"Cookie: ct0={_mask(cookie_meta.get('ct0', ''))} "
            f"auth_token={_mask(cookie_meta.get('auth_token', ''))}"
        )
    lines.append(f"任务: {report.get('task_type')} {json.dumps(report.get('params', {}), ensure_ascii=False)}")
    for name, check in (report.get("checks") or {}).items():
        flag = "通过" if check.get("ok") else "失败"
        lines.append(
            f"- {name}: {flag} | cookie_status={check.get('cookie_status')} "
            f"| tweets={check.get('tweet_count', 0)}"
        )
        if check.get("error"):
            lines.append(f"    错误: {check.get('error')}")
        for sample in check.get("sample") or []:
            lines.append(f"    · {sample.get('tweet_id')}: {sample.get('content')}")
    lines.append(f"总结: {'可用' if report.get('ok') else '不可用'}")
    if report.get("hint"):
        lines.append(f"建议: {report['hint']}")
    return "\n".join(lines)
