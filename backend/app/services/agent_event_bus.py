"""
协同事件 WebSocket 总线。

用途：
- 为 /agents 相关流程提供实时事件广播能力
- 支持前端以 WebSocket 订阅协同事件流
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AgentEventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def publish(self, message: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._clients)
        if not targets:
            return

        stale: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._clients.discard(ws)

    async def broadcast_heartbeat(self) -> None:
        await self.publish(
            {
                "type": "heartbeat",
                "ts": utc_now_iso(),
                "message": "agent_event_bus_online",
            }
        )

    async def stream_workflow_events(
        self,
        *,
        mission_id: str,
        dataset: str,
        scenario: str,
        events: list[dict[str, Any]],
        consensus_score: float | None,
        kpi_projection: dict[str, Any] | None,
        interval_sec: float = 0.18,
    ) -> None:
        await self.publish(
            {
                "type": "workflow_started",
                "mission_id": mission_id,
                "dataset": dataset,
                "scenario": scenario,
                "ts": utc_now_iso(),
            }
        )

        for index, event in enumerate(events, start=1):
            payload = {
                "type": "coordination_event",
                "mission_id": mission_id,
                "sequence": index,
                "event": event,
                "ts": utc_now_iso(),
            }
            await self.publish(payload)
            if interval_sec > 0:
                await asyncio.sleep(interval_sec)

        await self.publish(
            {
                "type": "workflow_completed",
                "mission_id": mission_id,
                "dataset": dataset,
                "scenario": scenario,
                "consensus_score": consensus_score,
                "kpi_projection": kpi_projection or {},
                "ts": utc_now_iso(),
            }
        )


agent_event_bus = AgentEventBus()
