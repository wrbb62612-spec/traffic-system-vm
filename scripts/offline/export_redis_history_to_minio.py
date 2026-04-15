#!/usr/bin/env python3
import json
import os
from io import BytesIO
from datetime import datetime, timezone

import redis
from minio import Minio


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def main() -> None:
    redis_host = os.getenv("REDIS_HOST", "127.0.0.1")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))

    minio_endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9000")
    minio_access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
    minio_secure = get_bool("MINIO_SECURE", False)
    minio_bucket = os.getenv("MINIO_BUCKET_FEATURE", "traffic-feature")

    r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

    client = Minio(
        endpoint=minio_endpoint,
        access_key=minio_access_key,
        secret_key=minio_secret_key,
        secure=minio_secure,
    )

    if not client.bucket_exists(minio_bucket):
        client.make_bucket(minio_bucket)

    keys = sorted(r.keys("feature:node:*:history"))
    if not keys:
        print("no redis history keys found")
        return

    export_time = utc_now()
    date_part = export_time.strftime("%Y-%m-%d")
    hour_part = export_time.strftime("%H")
    ts_part = export_time.strftime("%Y%m%dT%H%M%SZ")

    lines = []
    total_records = 0

    for key in keys:
        parts = key.split(":")
        if len(parts) < 4:
            continue
        node_id = parts[2]

        items = r.lrange(key, 0, -1)
        for raw in items:
            try:
                obj = json.loads(raw)
            except Exception:
                continue

            doc = {
                "node_id": node_id,
                "exported_at": export_time.isoformat(),
                "source_key": key,
                "feature_type": obj.get("feature_type", "windowed"),
                "window_size_sec": obj.get("window_size_sec"),
                "window_start": obj.get("window_start"),
                "window_end": obj.get("window_end"),
                "updated_at": obj.get("updated_at"),
                "sample_count": obj.get("sample_count"),
                "speed": obj.get("speed"),
                "flow": obj.get("flow"),
                "occupancy": obj.get("occupancy"),
                "time_of_day": obj.get("time_of_day"),
            }
            lines.append(json.dumps(doc, ensure_ascii=False))
            total_records += 1

    payload = ("\n".join(lines) + "\n").encode("utf-8")
    object_name = f"windowed/date={date_part}/hour={hour_part}/redis_history_{ts_part}.jsonl"

    client.put_object(
        bucket_name=minio_bucket,
        object_name=object_name,
        data=BytesIO(payload),
        length=len(payload),
        content_type="application/json",
    )

    print("export ok")
    print("bucket      =", minio_bucket)
    print("object_name =", object_name)
    print("keys        =", len(keys))
    print("records     =", total_records)


if __name__ == "__main__":
    main()