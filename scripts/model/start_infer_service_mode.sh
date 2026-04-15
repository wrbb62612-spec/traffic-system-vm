#!/usr/bin/env bash
set -euo pipefail

cd /opt/traffic-system/backend
source venv/bin/activate

MODE="${INFER_SERVICE_MODE:-replay}"
PORT="${INFER_SERVICE_PORT:-5001}"
BUNDLE_DIR="/opt/traffic-system/model_bundle"
NPZ_PATH="${INFER_SERVICE_REPLAY_NPZ:-/opt/traffic-system/model_bundle/dcrnn_predictions.npz}"

echo "== start infer service =="
echo "mode      = ${MODE}"
echo "port      = ${PORT}"
echo "bundle    = ${BUNDLE_DIR}"

if [ "${MODE}" = "replay" ]; then
  echo "npz_path   = ${NPZ_PATH}"
  python /opt/traffic-system/model_bundle/infer_service.py \
    --bundle-dir "${BUNDLE_DIR}" \
    --npz-path "${NPZ_PATH}" \
    --port "${PORT}"
elif [ "${MODE}" = "live" ]; then
  echo "live mode is reserved for future real online inference"
  echo "current repo does not yet provide a stable live backend implementation"
  exit 1
else
  echo "unknown INFER_SERVICE_MODE: ${MODE}"
  exit 1
fi
