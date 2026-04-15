#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/traffic-system/backend/.env"

if grep -q '^PREDICTOR_BACKEND=' "$ENV_FILE"; then
  sed -i 's/^PREDICTOR_BACKEND=.*/PREDICTOR_BACKEND=dcrnn/' "$ENV_FILE"
else
  echo 'PREDICTOR_BACKEND=dcrnn' >> "$ENV_FILE"
fi

if grep -q '^INFER_SERVICE_URL=' "$ENV_FILE"; then
  sed -i 's|^INFER_SERVICE_URL=.*|INFER_SERVICE_URL=http://127.0.0.1:5001|' "$ENV_FILE"
else
  echo 'INFER_SERVICE_URL=http://127.0.0.1:5001' >> "$ENV_FILE"
fi

if grep -q '^INFER_SERVICE_TIMEOUT=' "$ENV_FILE"; then
  sed -i 's/^INFER_SERVICE_TIMEOUT=.*/INFER_SERVICE_TIMEOUT=30/' "$ENV_FILE"
else
  echo 'INFER_SERVICE_TIMEOUT=30' >> "$ENV_FILE"
fi

cd /opt/traffic-system/backend
source venv/bin/activate

echo "== backend config =="
grep -E 'PREDICTOR_BACKEND|INFER_SERVICE_URL|INFER_SERVICE_TIMEOUT' "$ENV_FILE" || true

echo "== start backend with dcrnn predictor =="
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
