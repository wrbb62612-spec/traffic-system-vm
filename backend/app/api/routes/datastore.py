import json
from datetime import datetime, timezone

import pymysql
import redis
import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient

from app.core.config import Settings, get_settings

router = APIRouter(prefix="/datastore", tags=["datastore"])


class CurrentFeaturePayload(BaseModel):
    speed: float
    time_of_day: float
    updated_at: str | None = None


class HistoryFeaturePayload(BaseModel):
    speed: float
    time_of_day: float
    updated_at: str | None = None


def _redis_client(settings: Settings) -> redis.Redis:
    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        decode_responses=True,
    )


def _mongo_client(settings: Settings) -> MongoClient:
    return MongoClient(settings.mongo_uri)


def _safe_parse_json_items(raw_items: list[str]) -> list[dict]:
    parsed: list[dict] = []
    for item in raw_items:
        try:
            obj = json.loads(item)
            if isinstance(obj, dict):
                parsed.append(obj)
        except Exception:
            continue
    return parsed


def _sort_series_by_updated_at(series: list[dict]) -> list[dict]:
    def sort_key(x: dict):
        ts = x.get("updated_at")
        if not ts:
            return ""
        return ts

    return sorted(series, key=sort_key)


def _load_history_series(
    r: redis.Redis,
    node_id: str,
    steps: int,
) -> list[dict]:
    key = f"feature:node:{node_id}:history"
    raw = r.lrange(key, 0, max(steps - 1, 0))
    parsed = _safe_parse_json_items(raw)
    parsed = _sort_series_by_updated_at(parsed)
    return parsed


@router.get("/health")
def datastore_health(settings: Settings = Depends(get_settings)):
    result = {
        "redis": "down",
        "mysql": "down",
        "mongo": "down",
    }

    try:
        r = _redis_client(settings)
        result["redis"] = "up" if r.ping() else "down"
        result["redis_keys"] = r.keys("feature:*")
    except Exception as e:
        result["redis_error"] = str(e)

    try:
        conn = pymysql.connect(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            database=settings.mysql_database,
            autocommit=True,
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
            cursor.execute("SHOW TABLES;")
            tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        result["mysql"] = "up"
        result["mysql_tables"] = tables
    except Exception as e:
        result["mysql_error"] = str(e)

    try:
        client = _mongo_client(settings)
        client.admin.command("ping")
        db = client["traffic_events"]
        result["mongo"] = "up"
        result["mongo_collections"] = db.list_collection_names()
    except Exception as e:
        result["mongo_error"] = str(e)

    return result


@router.get("/feature/current/{node_id}")
def feature_current(node_id: str, settings: Settings = Depends(get_settings)):
    r = _redis_client(settings)
    key = f"feature:node:{node_id}:current"
    data = r.hgetall(key)
    return {
        "node_id": node_id,
        "key": key,
        "exists": bool(data),
        "data": data,
    }


@router.post("/feature/current/{node_id}")
def write_feature_current(
    node_id: str,
    payload: CurrentFeaturePayload,
    settings: Settings = Depends(get_settings),
):
    r = _redis_client(settings)
    key = f"feature:node:{node_id}:current"
    updated_at = payload.updated_at or datetime.now(timezone.utc).isoformat()

    r.hset(
        key,
        mapping={
            "speed": payload.speed,
            "time_of_day": payload.time_of_day,
            "updated_at": updated_at,
        },
    )
    r.expire(key, 3600)

    return {
        "status": "ok",
        "node_id": node_id,
        "key": key,
        "data": {
            "speed": payload.speed,
            "time_of_day": payload.time_of_day,
            "updated_at": updated_at,
        },
    }


@router.get("/feature/history/{node_id}")
def feature_history(node_id: str, steps: int = 12, settings: Settings = Depends(get_settings)):
    r = _redis_client(settings)
    key = f"feature:node:{node_id}:history"
    data = _load_history_series(r, node_id=node_id, steps=steps)

    return {
        "node_id": node_id,
        "key": key,
        "exists": bool(data),
        "count": len(data),
        "data": data,
    }


@router.post("/feature/history/{node_id}")
def write_feature_history(
    node_id: str,
    payload: HistoryFeaturePayload,
    settings: Settings = Depends(get_settings),
):
    r = _redis_client(settings)
    key = f"feature:node:{node_id}:history"
    updated_at = payload.updated_at or datetime.now(timezone.utc).isoformat()

    value = json.dumps(
        {
            "speed": payload.speed,
            "time_of_day": payload.time_of_day,
            "updated_at": updated_at,
        },
        ensure_ascii=False,
    )

    r.lpush(key, value)
    r.ltrim(key, 0, 11)
    r.expire(key, 7200)

    return {
        "status": "ok",
        "node_id": node_id,
        "key": key,
        "written": json.loads(value),
    }


@router.get("/feature/dcrnn-input")
def dcrnn_input_preview(node_ids: str, steps: int = 12, settings: Settings = Depends(get_settings)):
    r = _redis_client(settings)
    ids = [x.strip() for x in node_ids.split(",") if x.strip()]

    sensors = []
    for node_id in ids:
        series = _load_history_series(r, node_id=node_id, steps=steps)

        speed_series = [float(x.get("speed", 0.0)) for x in series]
        time_of_day_series = [float(x.get("time_of_day", 0.0)) for x in series]

        sensors.append(
            {
                "node_id": node_id,
                "history_count": len(series),
                "speed_series": speed_series,
                "time_of_day_series": time_of_day_series,
            }
        )

    return {
        "backend": "redis-feature-store",
        "steps": steps,
        "node_count": len(sensors),
        "nodes": sensors,
    }


@router.post("/predict/from-feature-store")
def predict_from_feature_store(
    node_ids: str,
    steps: int = 12,
    settings: Settings = Depends(get_settings),
):
    r = _redis_client(settings)
    ids = [x.strip() for x in node_ids.split(",") if x.strip()]

    if not ids:
        raise HTTPException(status_code=400, detail="node_ids 不能为空")

    sensors = []
    for node_id in ids:
        series = _load_history_series(r, node_id=node_id, steps=steps)
        speed_series = [float(x.get("speed", 0.0)) for x in series]

        sensors.append(
            {
                "sensor_id": str(node_id),
                "speed_series": speed_series,
            }
        )

    payload = {
        "timestamps": [],
        "sensors": sensors,
    }

    try:
        resp = requests.post(
            f"{settings.infer_service_url.rstrip('/')}/predict",
            json=payload,
            timeout=settings.infer_service_timeout,
        )
        resp.raise_for_status()
        infer_result = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"infer_service 调用失败: {e}")

    # 1) 回写 Redis 缓存
    cache_key = f"prediction:last:{','.join(ids)}"
    cache_doc = {
        "node_ids": ids,
        "steps": steps,
        "payload": payload,
        "infer_service_result": infer_result,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r.setex(cache_key, 300, json.dumps(cache_doc, ensure_ascii=False))

    # 2) 回写 MongoDB
    try:
        client = _mongo_client(settings)
        db = client["traffic_events"]
        db["prediction_runs"].insert_one(cache_doc)
    except Exception:
        pass

    return {
        "source": "redis-feature-store",
        "steps": steps,
        "node_ids": ids,
        "payload_sent_to_infer_service": payload,
        "infer_service_result": infer_result,
        "redis_cache_key": cache_key,
        "mongo_collection": "prediction_runs",
    }


@router.get("/predict/cache/latest")
def latest_prediction_cache(node_ids: str, settings: Settings = Depends(get_settings)):
    r = _redis_client(settings)
    ids = [x.strip() for x in node_ids.split(",") if x.strip()]
    cache_key = f"prediction:last:{','.join(ids)}"
    raw = r.get(cache_key)

    if not raw:
        return {
            "exists": False,
            "cache_key": cache_key,
            "data": None,
        }

    try:
        data = json.loads(raw)
    except Exception:
        data = raw

    return {
        "exists": True,
        "cache_key": cache_key,
        "data": data,
    }