from tagai_data_supply.runtime.dedup import BoundedSet


def test_seen_returns_false_for_new():
    s = BoundedSet(10)
    assert s.seen("a") is False
    s.add("a")
    assert s.seen("a") is True


def test_add_then_seen():
    s = BoundedSet(10)
    s.add("1")
    assert "1" in s
    assert s.seen("1") is True


def test_capacity_eviction_lru():
    s = BoundedSet(2)
    s.add("a")
    s.add("b")
    # 访问 a，使其成为最近使用
    assert s.seen("a") is True
    s.add("c")  # 容量超限，淘汰最久未使用 b
    assert "a" in s
    assert "c" in s
    assert "b" not in s
    assert len(s) == 2


def test_len():
    s = BoundedSet(5)
    s.add("x"); s.add("y")
    assert len(s) == 2
