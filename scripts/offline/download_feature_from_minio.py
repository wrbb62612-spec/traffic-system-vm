#!/usr/bin/env python3
import os

from minio import Minio


DEFAULT_BUCKET = "traffic-feature"
DEFAULT_PREFIX = "windowed/"
DEFAULT_OUT_DIR = "/opt/traffic-dw/data/feature_export"


def main() -> None:
    endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"

    bucket = os.getenv("MINIO_BUCKET_FEATURE", DEFAULT_BUCKET)
    prefix = os.getenv("MINIO_PREFIX", DEFAULT_PREFIX)
    out_dir = os.getenv("MINIO_DOWNLOAD_DIR", DEFAULT_OUT_DIR)

    os.makedirs(out_dir, exist_ok=True)

    client = Minio(
        endpoint=endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )

    objects = list(client.list_objects(bucket, prefix=prefix, recursive=True))
    if not objects:
        print("no objects found")
        return

    for obj in objects:
        rel_path = obj.object_name[len(prefix):] if obj.object_name.startswith(prefix) else obj.object_name
        local_path = os.path.join(out_dir, rel_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        client.fget_object(bucket, obj.object_name, local_path)
        print("downloaded:", obj.object_name, "->", local_path)


if __name__ == "__main__":
    main()