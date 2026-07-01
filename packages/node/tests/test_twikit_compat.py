"""twikit 补丁模块单测（不发起真实网络请求）。"""
import pytest

pytest.importorskip("twikit.x_client_transaction.transaction")

from tagai_data_supply.scraper import twikit_compat as tc


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
