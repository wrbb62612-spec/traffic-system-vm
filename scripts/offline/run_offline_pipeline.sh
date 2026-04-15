#!/usr/bin/env bash
set -euo pipefail

echo "== stage3 offline pipeline start =="

echo "[0/6] ensure infra up"
docker compose -f /opt/traffic-dw/compose/offline.yml up -d
docker compose -f /opt/traffic-dw/compose/docker-compose.yml up -d

echo "[1/6] wait for minio"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
    echo "minio is ready"
    break
  fi
  echo "waiting minio... ($i)"
  sleep 2
done

echo "[2/6] wait for redis"
for i in $(seq 1 20); do
  if docker exec redis-fs redis-cli ping >/dev/null 2>&1; then
    echo "redis is ready"
    break
  fi
  echo "waiting redis... ($i)"
  sleep 2
done

echo "[3/6] export redis history to minio"
cd /opt/traffic-system/backend
source venv/bin/activate

export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export MINIO_ENDPOINT=127.0.0.1:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin123
export MINIO_SECURE=false
export MINIO_BUCKET_FEATURE=traffic-feature
export MINIO_DOWNLOAD_DIR=/opt/traffic-dw/data/feature_export

python /opt/traffic-system/scripts/offline/export_redis_history_to_minio.py

echo "[4/6] download feature files from minio"
python /opt/traffic-system/scripts/offline/download_feature_from_minio.py

echo "[5/6] run local summary"
python3 /opt/traffic-dw/jobs/build_feature_summary_light.py

echo "[6/6] list minio feature objects"
docker run --rm --network host --entrypoint /bin/sh docker.m.daocloud.io/minio/mc:latest -c '
mc alias set local http://127.0.0.1:9000 minioadmin minioadmin123 >/dev/null 2>&1
mc ls --recursive local/traffic-feature
'

echo "== stage3 offline pipeline done =="
