#!/usr/bin/env bash
set -euo pipefail

echo "== start offline infra =="

docker compose -f /opt/traffic-dw/compose/offline.yml up -d
docker compose -f /opt/traffic-dw/compose/docker-compose.yml up -d

echo
echo "== minio =="
curl -i http://127.0.0.1:9000/minio/health/live || true

echo
echo "== redis =="
docker exec -it redis-fs redis-cli ping || true

echo
echo "== running containers =="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "traffic-minio|redis-fs|mongo-traffic|mysql-traffic" || true
