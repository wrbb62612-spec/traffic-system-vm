#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/opt/traffic-system"
PORT="${PORT:-5173}"

cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node 未安装，请先安装 Node.js。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[INFO] node_modules 不存在，自动执行 npm install --legacy-peer-deps"
  npm install --legacy-peer-deps
fi

echo "[INFO] 启动前端: http://0.0.0.0:${PORT}"
exec npm run dev -- --host 0.0.0.0 --port "$PORT"
