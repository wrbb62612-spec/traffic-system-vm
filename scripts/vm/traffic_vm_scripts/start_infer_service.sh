#!/usr/bin/env bash
set -euo pipefail

MODEL_ROOT="/opt/traffic-system/model_bundle"
PORT="${PORT:-5001}"
NPZ_PATH="${NPZ_PATH:-/opt/traffic-system/model_bundle/dcrnn_predictions.npz}"

cd "$MODEL_ROOT"

if [ ! -d venv ]; then
  echo "[INFO] infer_service venv 不存在，自动创建"
  python3 -m venv venv
fi

source venv/bin/activate

if ! python -c "import flask, numpy" >/dev/null 2>&1; then
  echo "[INFO] 安装 infer_service 依赖"
  pip install flask numpy
fi

if [ ! -f "$NPZ_PATH" ]; then
  echo "[ERROR] 找不到 dcrnn_predictions.npz: $NPZ_PATH"
  exit 1
fi

echo "[INFO] 启动 DCRNN 回放推理服务: http://0.0.0.0:${PORT}"
exec python infer_service.py --npz-path "$NPZ_PATH" --port "$PORT"
