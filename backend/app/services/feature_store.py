import json
from typing import Any

import redis

from app.core.config import Settings


class FeatureStoreService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
        )

    def ping(self) -> bool:
        return bool(self.client.ping())

    def _current_key(self, node_id: str | int) -> str:
        return f"feature:node:{node_id}:current"

    def _history_key(self, node_id: str | int) -> str:
        return f"feature:node:{node_id}:history"

    def get_current_feature(self, node_id: str | int) -> dict[str, Any]:
        key = self._current_key(node_id)
        data = self.client.hgetall(key)
        if not data:
            return {
                "node_id": str(node_id),
                "exists": False,
                "key": key,
                "data": {},
            }
        return {
            "node_id": str(node_id),
            "exists": True,
            "key": key,
            "data": data,
        }

    def get_history_feature(self, node_id: str | int, steps: int = 12) -> dict[str, Any]:
        key = self._history_key(node_id)
        raw_items = self.client.lrange(key, 0, max(steps - 1, 0))
        items: list[Any] = []

        for item in raw_items:
            try:
                items.append(json.loads(item))
            except Exception:
                items.append(item)

        return {
            "node_id": str(node_id),
            "exists": len(raw_items) > 0,
            "key": key,
            "count": len(items),
            "steps_requested": steps,
            "data": items,
        }

    def assemble_dcrnn_input(self, node_ids: list[str | int], steps: int = 12) -> dict[str, Any]:
        """
        当前先做调试版输入组装：
        - 从 Redis history 读取最近 steps 条记录
        - 按节点返回，方便后续接真正的 DCRNN 输入张量
        """
        result: list[dict[str, Any]] = []

        for node_id in node_ids:
            history = self.get_history_feature(node_id=node_id, steps=steps)
            result.append(
                {
                    "node_id": str(node_id),
                    "history_count": history["count"],
                    "history": history["data"],
                }
            )

        return {
            "backend": "redis-feature-store",
            "steps": steps,
            "nodes": result,
        }