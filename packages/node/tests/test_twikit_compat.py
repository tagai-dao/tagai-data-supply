"""twikit 补丁模块单测（不发起真实网络请求）。"""
import pytest

pytest.importorskip("twikit.x_client_transaction.transaction")

from tagai_data_supply.scraper import twikit_compat as tc


def test_apply_user_core_patch_fills_screen_name():
    pytest.importorskip("twikit.user")
    from twikit.user import User
    from tagai_data_supply.scraper.twikit_compat import apply_twikit_user_core_patch

    apply_twikit_user_core_patch()
    data = {
        "rest_id": "123",
        "legacy": {"followers_count": 1, "friends_count": 2, "statuses_count": 3},
        "core": {"name": "Alice", "screen_name": "alice_x"},
        "avatar": {"image_url": "https://pbs.twimg.com/a.jpg"},
    }
    user = User(None, data)  # type: ignore[arg-type]
    assert user.screen_name == "alice_x"
    assert user.name == "Alice"
    assert user.profile_image_url == "https://pbs.twimg.com/a.jpg"


def test_apply_patch_skips_when_upstream_fixed():
    tc._PATCHED = False
    tx_mod = __import__(
        "twikit.x_client_transaction.transaction",
        fromlist=["ClientTransaction"],
    )
    if getattr(tx_mod, "ON_DEMAND_HASH_PATTERN", None):
        tc.apply_twikit_transaction_patch()
        assert tx_mod.ClientTransaction.get_indices is not tc._patched_get_indices
        return
    tc.apply_twikit_transaction_patch()
    assert tx_mod.ClientTransaction.get_indices is tc._patched_get_indices


def test_apply_patch_is_idempotent_on_legacy():
    tx_mod = __import__(
        "twikit.x_client_transaction.transaction",
        fromlist=["ClientTransaction"],
    )
    if getattr(tx_mod, "ON_DEMAND_HASH_PATTERN", None):
        return  # twikit-ng 环境跳过 legacy 测试
    tc._PATCHED = False
    tc.apply_twikit_transaction_patch()
    assert tx_mod.ClientTransaction.get_indices is tc._patched_get_indices
    tc.apply_twikit_transaction_patch()
    assert tx_mod.ClientTransaction.get_indices is tc._patched_get_indices
