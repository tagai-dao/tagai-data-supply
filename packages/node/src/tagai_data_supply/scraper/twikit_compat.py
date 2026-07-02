"""twikit 兼容补丁：X 改版后内部 API 字段迁移（transaction 正则、User core 字段等）。

在 `from twikit import Client` 之前调用 apply_twikit_patches()。
上游修复合并后可移除此模块。
"""
from __future__ import annotations

import re
from typing import Any, Callable

_PATCHED = False
_USER_CORE_PATCHED = False
_ORIG_USER_INIT: Callable[..., None] | None = None

# 新版 webpack chunk 格式（2026-03 起）
_ON_DEMAND_FILE_REGEX = re.compile(
    r""",(\d+):["']ondemand\.s["']""",
    flags=(re.VERBOSE | re.MULTILINE),
)
_ON_DEMAND_HASH_PATTERN = r',{}:["\']([0-9a-f]+)["\']'
_INDICES_REGEX = re.compile(
    r"""(\(\w{1,2}\[(\d{1,2})\],\s*16\))+""",
    flags=(re.VERBOSE | re.MULTILINE),
)

# 旧版内联 hash 格式（保留兼容）
_LEGACY_ON_DEMAND_FILE_REGEX = re.compile(
    r"""['|\"]{1}ondemand\.s['|\"]{1}:\s*['|\"]{1}([\w]*)['|\"]{1}""",
    flags=(re.VERBOSE | re.MULTILINE),
)
_LEGACY_INDICES_REGEX = re.compile(
    r"""(\(\w{1}\[(\d{1,2})\],\s*16\))+""",
    flags=(re.VERBOSE | re.MULTILINE),
)


async def _patched_get_indices(self, home_page_response, session, headers):
    """先尝试新 webpack 格式，再回退旧格式。"""
    key_byte_indices: list[str] = []
    response = self.validate_response(home_page_response) or self.home_page_response
    response_str = str(response)

    on_demand_file = _ON_DEMAND_FILE_REGEX.search(response_str)
    if on_demand_file:
        chunk_index = on_demand_file.group(1)
        hash_regex = re.compile(_ON_DEMAND_HASH_PATTERN.format(chunk_index))
        hash_match = hash_regex.search(response_str)
        if hash_match:
            filename = hash_match.group(1)
            url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{filename}a.js"
            js_resp = await session.request(method="GET", url=url, headers=headers)
            for item in _INDICES_REGEX.finditer(str(js_resp.text)):
                key_byte_indices.append(item.group(2))

    if not key_byte_indices:
        legacy = _LEGACY_ON_DEMAND_FILE_REGEX.search(response_str)
        if legacy:
            url = f"https://abs.twimg.com/responsive-web/client-web/ondemand.s.{legacy.group(1)}a.js"
            js_resp = await session.request(method="GET", url=url, headers=headers)
            for item in _LEGACY_INDICES_REGEX.finditer(str(js_resp.text)):
                key_byte_indices.append(item.group(2))

    if not key_byte_indices:
        raise Exception("Couldn't get KEY_BYTE indices")

    indices = list(map(int, key_byte_indices))
    return indices[0], indices[1:]


def apply_twikit_transaction_patch() -> None:
    """幂等：仅对未修复的 twikit 2.3.x 打补丁（twikit-ng 已内置修复则跳过）。"""
    global _PATCHED
    if _PATCHED:
        return

    try:
        tx_mod = __import__(
            "twikit.x_client_transaction.transaction",
            fromlist=["ClientTransaction"],
        )
    except ModuleNotFoundError:
        # 安装残缺（如 twifork PyPI 包）时由 _ensure_client 给出重装指引
        return

    # twikit-ng 等维护分支已含 ON_DEMAND_HASH_PATTERN
    if getattr(tx_mod, "ON_DEMAND_HASH_PATTERN", None):
        _PATCHED = True
        return

    tx_mod.ON_DEMAND_FILE_REGEX = _ON_DEMAND_FILE_REGEX
    tx_mod.INDICES_REGEX = _INDICES_REGEX
    tx_mod.ClientTransaction.get_indices = _patched_get_indices
    _PATCHED = True


def _fill_user_core_fields(user: Any, data: dict) -> None:
    """X 2026 起 name/screen_name 常在 core，头像在 avatar.image_url。"""
    core = data.get("core") or {}
    legacy = data.get("legacy") or {}
    avatar = data.get("avatar") or {}

    if not str(getattr(user, "name", "") or "").strip():
        user.name = (core.get("name") or legacy.get("name") or "").strip()
    if not str(getattr(user, "screen_name", "") or "").strip():
        user.screen_name = (core.get("screen_name") or legacy.get("screen_name") or "").strip()
    if not str(getattr(user, "profile_image_url", "") or "").strip():
        user.profile_image_url = (
            legacy.get("profile_image_url_https")
            or legacy.get("profile_image_url")
            or avatar.get("image_url")
            or ""
        ).strip()
    if not str(getattr(user, "created_at", "") or "").strip():
        user.created_at = (core.get("created_at") or legacy.get("created_at") or "").strip()


def apply_twikit_user_core_patch() -> None:
    """twikit-ng 仍只读 legacy；搜索时间线作者字段为空时从 core 回填。"""
    global _USER_CORE_PATCHED, _ORIG_USER_INIT
    if _USER_CORE_PATCHED:
        return
    try:
        from twikit.user import User
    except ImportError:
        return

    if _ORIG_USER_INIT is None:
        _ORIG_USER_INIT = User.__init__

    def _patched_user_init(self, client, data: dict) -> None:
        assert _ORIG_USER_INIT is not None
        _ORIG_USER_INIT(self, client, data)
        self._data = data
        _fill_user_core_fields(self, data)

    User.__init__ = _patched_user_init  # type: ignore[method-assign]
    _USER_CORE_PATCHED = True


def apply_twikit_patches() -> None:
    """应用全部 twikit 兼容补丁（幂等）。"""
    apply_twikit_transaction_patch()
    apply_twikit_user_core_patch()


def scraper_install_hint() -> str:
    return (
        "pip uninstall twikit twifork twikit-ng -y && "
        "pip install -e \".[scraper]\""
    )
