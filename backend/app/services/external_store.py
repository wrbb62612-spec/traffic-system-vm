import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone

from app.core.config import Settings
from app.schemas.external_data import ExternalContextRequest, ExternalContextResponse


def _connect(settings: Settings) -> sqlite3.Connection:
    db_path = settings.external_db_path
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_external_db(settings: Settings) -> None:
    with closing(_connect(settings)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS external_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fetched_at TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                radius_km REAL NOT NULL,
                country_code TEXT NOT NULL,
                state_code TEXT NOT NULL,
                city TEXT NOT NULL,
                providers_json TEXT NOT NULL,
                data_json TEXT NOT NULL,
                issues_json TEXT NOT NULL,
                missing_credentials_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_external_snapshots_fetched_at
            ON external_snapshots (fetched_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS external_provider_cache (
                provider TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (provider, cache_key)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_external_provider_cache_expires
            ON external_provider_cache (expires_at)
            """
        )
        conn.commit()


def save_external_snapshot(
    settings: Settings, req: ExternalContextRequest, resp: ExternalContextResponse
) -> int:
    fetched_at = (resp.fetched_at or datetime.now(timezone.utc)).isoformat()
    with closing(_connect(settings)) as conn:
        cursor = conn.execute(
            """
            INSERT INTO external_snapshots (
                fetched_at, lat, lon, radius_km, country_code, state_code, city,
                providers_json, data_json, issues_json, missing_credentials_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fetched_at,
                req.location.lat,
                req.location.lon,
                req.radius_km,
                req.country_code,
                req.state_code,
                req.city,
                json.dumps(req.providers, ensure_ascii=False),
                json.dumps(resp.data, ensure_ascii=False),
                json.dumps([i.model_dump() for i in resp.issues], ensure_ascii=False),
                json.dumps(resp.missing_credentials, ensure_ascii=False),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def list_external_snapshots(settings: Settings, limit: int = 20) -> list[dict]:
    with closing(_connect(settings)) as conn:
        rows = conn.execute(
            """
            SELECT id, fetched_at, lat, lon, radius_km, country_code, state_code, city,
                   providers_json, data_json, issues_json, missing_credentials_json
            FROM external_snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    result = []
    for row in rows:
        result.append(
            {
                "id": row["id"],
                "fetched_at": row["fetched_at"],
                "lat": row["lat"],
                "lon": row["lon"],
                "radius_km": row["radius_km"],
                "country_code": row["country_code"],
                "state_code": row["state_code"],
                "city": row["city"],
                "providers": json.loads(row["providers_json"]),
                "data": json.loads(row["data_json"]),
                "issues": json.loads(row["issues_json"]),
                "missing_credentials": json.loads(row["missing_credentials_json"]),
            }
        )
    return result


def get_external_snapshot_by_id(settings: Settings, snapshot_id: int) -> dict | None:
    with closing(_connect(settings)) as conn:
        row = conn.execute(
            """
            SELECT id, fetched_at, lat, lon, radius_km, country_code, state_code, city,
                   providers_json, data_json, issues_json, missing_credentials_json
            FROM external_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "fetched_at": row["fetched_at"],
        "lat": row["lat"],
        "lon": row["lon"],
        "radius_km": row["radius_km"],
        "country_code": row["country_code"],
        "state_code": row["state_code"],
        "city": row["city"],
        "providers": json.loads(row["providers_json"]),
        "data": json.loads(row["data_json"]),
        "issues": json.loads(row["issues_json"]),
        "missing_credentials": json.loads(row["missing_credentials_json"]),
    }


def get_cached_provider_payload(
    settings: Settings, provider: str, cache_key: str
) -> dict | None:
    with closing(_connect(settings)) as conn:
        row = conn.execute(
            """
            SELECT provider, cache_key, updated_at, expires_at, payload_json
            FROM external_provider_cache
            WHERE provider = ? AND cache_key = ?
            """,
            (provider, cache_key),
        ).fetchone()
    if not row:
        return None
    return {
        "provider": row["provider"],
        "cache_key": row["cache_key"],
        "updated_at": row["updated_at"],
        "expires_at": row["expires_at"],
        "payload": json.loads(row["payload_json"]),
    }


def upsert_cached_provider_payload(
    settings: Settings,
    provider: str,
    cache_key: str,
    updated_at: str,
    expires_at: str,
    payload: dict,
) -> None:
    with closing(_connect(settings)) as conn:
        conn.execute(
            """
            INSERT INTO external_provider_cache (
                provider, cache_key, updated_at, expires_at, payload_json
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider, cache_key) DO UPDATE SET
                updated_at=excluded.updated_at,
                expires_at=excluded.expires_at,
                payload_json=excluded.payload_json
            """,
            (
                provider,
                cache_key,
                updated_at,
                expires_at,
                json.dumps(payload, ensure_ascii=False),
            ),
        )
        conn.commit()
