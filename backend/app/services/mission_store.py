"""
任务历史持久化服务。

使用 SQLite 存储每次多智能体协同运行的完整记录，支持：
- 保存任务结果（含 workflow_state、request、node_trace）
- 列出历史任务（分页）
- 按 mission_id 查询完整详情
- 删除过期记录
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── schema ──────────────────────────────────────────────────────────────────

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS missions (
    mission_id      TEXT PRIMARY KEY,
    dataset         TEXT NOT NULL,
    scenario        TEXT NOT NULL,
    consensus_score REAL,
    revision_round  INTEGER DEFAULT 0,
    risk_count      INTEGER DEFAULT 0,
    speed_gain_pct  REAL,
    congestion_drop_pct REAL,
    created_at      TEXT NOT NULL,
    request_json    TEXT,
    result_json     TEXT,
    trace_json      TEXT
);

CREATE TABLE IF NOT EXISTS hitl_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id  TEXT NOT NULL,
    risk_id     TEXT NOT NULL,
    action      TEXT NOT NULL CHECK (action IN ('approve','reject','modify')),
    reason      TEXT DEFAULT '',
    decided_at  TEXT NOT NULL,
    UNIQUE (mission_id, risk_id)
);
"""


# ─── init ─────────────────────────────────────────────────────────────────────

def init_mission_db(settings) -> None:
    path = Path(settings.mission_db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(path)) as conn:
        conn.executescript(_CREATE_SQL)
        conn.commit()


# ─── mission CRUD ─────────────────────────────────────────────────────────────

def save_mission(
    settings,
    *,
    mission_id: str,
    dataset: str,
    scenario: str,
    consensus_score: float | None,
    revision_round: int,
    risk_register: list[dict[str, Any]],
    kpi_projection: dict[str, Any],
    request_data: dict[str, Any],
    result_data: dict[str, Any],
    node_trace: list[dict[str, Any]] | None = None,
) -> None:
    kpi_after = kpi_projection.get("after", {})
    kpi_before = kpi_projection.get("before", {})
    speed_gain = kpi_projection.get("speed_gain_pct")
    cong_drop  = kpi_projection.get("congestion_drop_pct")

    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO missions
              (mission_id, dataset, scenario, consensus_score, revision_round,
               risk_count, speed_gain_pct, congestion_drop_pct, created_at,
               request_json, result_json, trace_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                mission_id,
                dataset,
                scenario,
                consensus_score,
                revision_round,
                len(risk_register),
                speed_gain,
                cong_drop,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                json.dumps(request_data, ensure_ascii=False, default=str),
                json.dumps(result_data,  ensure_ascii=False, default=str),
                json.dumps(node_trace or [], ensure_ascii=False),
            ),
        )
        conn.commit()


def list_missions(settings, limit: int = 30) -> list[dict[str, Any]]:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT mission_id, dataset, scenario, consensus_score,
                   revision_round, risk_count, speed_gain_pct,
                   congestion_drop_pct, created_at
            FROM missions
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_mission_overview(settings) -> dict[str, Any]:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        stats_row = conn.execute(
            """
            SELECT
                COUNT(*) AS total_missions,
                AVG(consensus_score) AS avg_consensus_score,
                SUM(CASE WHEN risk_count > 0 THEN 1 ELSE 0 END) AS missions_with_risk,
                MAX(created_at) AS latest_created_at
            FROM missions
            """
        ).fetchone()
        latest_row = conn.execute(
            """
            SELECT mission_id, dataset, scenario, consensus_score,
                   revision_round, risk_count, speed_gain_pct,
                   congestion_drop_pct, created_at
            FROM missions
            ORDER BY created_at DESC
            LIMIT 1
            """
        ).fetchone()

    stats = dict(stats_row or {})
    latest = dict(latest_row) if latest_row else None
    avg = stats.get("avg_consensus_score")
    return {
        "total_missions": int(stats.get("total_missions") or 0),
        "avg_consensus_score": round(float(avg), 1) if avg is not None else None,
        "missions_with_risk": int(stats.get("missions_with_risk") or 0),
        "latest_created_at": stats.get("latest_created_at"),
        "latest_mission": latest,
    }


def get_mission(settings, mission_id: str) -> dict[str, Any] | None:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM missions WHERE mission_id = ?", (mission_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    for key in ("result_json", "request_json", "trace_json"):
        raw = d.pop(key, None)
        if raw:
            out_key = key.replace("_json", "")
            try:
                d[out_key] = json.loads(raw)
            except Exception:
                d[out_key] = raw
    return d


def get_mission_request(settings, mission_id: str) -> dict[str, Any] | None:
    """只返回 request 字段，用于 HITL 重新触发时重建请求体。"""
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        row = conn.execute(
            "SELECT request_json FROM missions WHERE mission_id = ?", (mission_id,)
        ).fetchone()
    if not row or not row[0]:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return None


# ─── HITL decisions ───────────────────────────────────────────────────────────

def upsert_hitl_decision(
    settings,
    mission_id: str,
    risk_id: str,
    action: str,
    reason: str = "",
) -> None:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.execute(
            """
            INSERT INTO hitl_decisions (mission_id, risk_id, action, reason, decided_at)
            VALUES (?,?,?,?,?)
            ON CONFLICT(mission_id, risk_id) DO UPDATE SET
                action=excluded.action,
                reason=excluded.reason,
                decided_at=excluded.decided_at
            """,
            (
                mission_id,
                risk_id,
                action,
                reason,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        conn.commit()


def get_hitl_decisions(settings, mission_id: str) -> list[dict[str, Any]]:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM hitl_decisions WHERE mission_id = ? ORDER BY decided_at",
            (mission_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_hitl_decision(settings, mission_id: str, risk_id: str) -> bool:
    with sqlite3.connect(str(settings.mission_db_path)) as conn:
        cursor = conn.execute(
            "DELETE FROM hitl_decisions WHERE mission_id = ? AND risk_id = ?",
            (mission_id, risk_id),
        )
        conn.commit()
    return cursor.rowcount > 0
