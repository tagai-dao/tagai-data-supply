"""本地有界 LRU 去重（spec §2: 节点预去重省带宽）。"""
from __future__ import annotations
from collections import OrderedDict


class BoundedSet:
    """有界 LRU 集合：超容量淘汰最久未访问项。"""

    def __init__(self, capacity: int = 50000):
        self.capacity = capacity
        self._data: OrderedDict[str, None] = OrderedDict()

    def seen(self, key: str) -> bool:
        """返回 True 表示已存在（判重）。"""
        if key in self._data:
            self._data.move_to_end(key)
            return True
        return False

    def add(self, key: str) -> None:
        if key in self._data:
            self._data.move_to_end(key)
            return
        self._data[key] = None
        if len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def __len__(self) -> int:
        return len(self._data)
