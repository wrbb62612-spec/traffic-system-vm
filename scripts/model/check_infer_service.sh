#!/usr/bin/env bash
set -euo pipefail

PORT="${INFER_SERVICE_PORT:-5001}"

echo "== infer service health =="
curl -s "http://127.0.0.1:${PORT}/health" || true
echo
