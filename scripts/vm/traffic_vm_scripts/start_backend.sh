#!/usr/bin/env bash
set -euo pipefail

BACKEND_ROOT="/opt/traffic-system/backend"
PORT="${PORT:-8000}"

cd "$BACKEND_ROOT"

if [ ! -d venv ]; then
  echo "[INFO] backend venv 不存在，自动创建"
  python3 -m venv venv
fi

source venv/bin/activate

if [ ! -f .env ]; then
  echo "[WARN] .env 不存在，请先检查后端配置。"
fi

if ! python -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "[INFO] 安装 backend 依赖"
  pip install -r requirements.txt
fi

echo "[INFO] 启动后端: http://0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
