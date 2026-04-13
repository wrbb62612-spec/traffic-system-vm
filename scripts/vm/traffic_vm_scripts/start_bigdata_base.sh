#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/traffic-dw"
COMPOSE_DIR="$BASE_DIR/compose"
CONFIG_MYSQL="$BASE_DIR/config/mysql"
CONFIG_MONGO="$BASE_DIR/config/mongodb"

mkdir -p "$COMPOSE_DIR" "$CONFIG_MYSQL" "$CONFIG_MONGO" "$BASE_DIR/logs"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "$SCRIPT_DIR/docker-compose.base.yml" "$COMPOSE_DIR/docker-compose.yml"
cp "$SCRIPT_DIR/mysql/01_init.sql" "$CONFIG_MYSQL/01_init.sql"
cp "$SCRIPT_DIR/mongodb/01_init.js" "$CONFIG_MONGO/01_init.js"

cd "$COMPOSE_DIR"
docker compose up -d

echo "[INFO] 大数据底座已启动。查看状态: docker compose ps"
echo "[INFO] 初始化 Redis 示例数据: bash $SCRIPT_DIR/init_redis_feature_store.sh"
