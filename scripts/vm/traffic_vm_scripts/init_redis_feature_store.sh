#!/usr/bin/env bash
set -euo pipefail

docker exec -i redis-fs redis-cli <<'REDIS'
DEL feature:node:1001:current feature:node:1001:history system:data_freshness system:model_last_inference
HSET feature:node:1001:current speed 42.5 time_of_day 0.3333 updated_at 2026-04-12T08:00:00
EXPIRE feature:node:1001:current 3600
LPUSH feature:node:1001:history {"speed":42.5,"time_of_day":0.3333,"updated_at":"2026-04-12T08:00:00"} {"speed":44.1,"time_of_day":0.3299,"updated_at":"2026-04-12T07:55:00"}
LTRIM feature:node:1001:history 0 11
EXPIRE feature:node:1001:history 7200
SET system:data_freshness 2026-04-12T08:00:00
SET system:model_last_inference 2026-04-12T08:00:00
REDIS

echo "[INFO] Redis Feature Store 示例数据已写入。"
