"""
DCRNN 推理服务（无 TensorFlow 版）
=====================================
直接使用已训练好的 dcrnn_predictions.npz 作为预测数据源，
无需 TF / conda 环境，Python 3.8+ 均可运行。

运行方式:
    cd d:/4C/traffic-system/model_bundle
    pip install flask numpy
    python infer_service.py --npz-path d:/4C/dcrnn_predictions.npz --port 5001

接口:
    GET  /health
    POST /predict           — 接收传感器数据，返回 12 步预测
    GET  /heatmap?horizon=1 — 返回当前缓存的热力图数据
    POST /predict-and-cache — 预测并缓存热力值供 /heatmap 使用
"""

import argparse
import json
import logging
import os

import numpy as np
from flask import Flask, jsonify, request

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

V_FREE = 70.0          # 自由流速度阈值 (mph)

_state: dict = {}      # 全局模型状态


# ─────────────────────────── 启动加载 ───────────────────────────

def load_data(bundle_dir: str, npz_path: str) -> None:
    """启动时一次性加载所有资源。"""

    # 1. 传感器元信息
    meta_path = os.path.join(bundle_dir, "sensor_meta.json")
    with open(meta_path, encoding="utf-8") as f:
        sensor_meta = json.load(f)                # list[{index,sensor_id,lat,lon}]

    # 2. scaler 参数
    scaler_path = os.path.join(bundle_dir, "scaler.json")
    with open(scaler_path, encoding="utf-8") as f:
        scaler = json.load(f)                      # {mean, std}

    # 3. DCRNN 预测结果 — 已是真实 mph，无需反标准化
    #    shape: [12, n_samples, 207]  (horizon × samples × sensors)
    npz = np.load(npz_path)
    predictions = npz["predictions"].astype(np.float32)   # [12, N, 207]
    predictions = np.clip(predictions, 0, 200)

    n_horizons, n_samples, n_nodes = predictions.shape
    logger.info(
        "预测数据加载完毕: horizons=%d  samples=%d  sensors=%d",
        n_horizons, n_samples, n_nodes,
    )

    _state.update({
        "sensor_meta": sensor_meta,
        "scaler": scaler,
        "predictions": predictions,
        "n_horizons": n_horizons,
        "n_samples": n_samples,
        "n_nodes": n_nodes,
        "last_speeds": None,           # 缓存最近一次推理结果 [n_nodes, n_horizons]
        "current_sample_idx": n_samples - 1,  # 默认使用最后一个测试样本
    })


# ─────────────────────────── 推理工具 ───────────────────────────

def _sensor_id_to_index() -> dict:
    return {str(s["sensor_id"]): s["index"] for s in _state["sensor_meta"]}


def _pick_sample_by_speeds(speeds_matrix: np.ndarray) -> int:
    """
    根据输入历史速度，从测试集里找最接近的样本（按均速排序）。
    speeds_matrix: [n_nodes] 最近一步速度，或 None。
    """
    preds = _state["predictions"]              # [12, N, 207]
    # 用 horizon=1 的各节点预测速度均值做匹配
    pred_means = preds[0, :, :].mean(axis=1)   # [N]
    input_mean = float(speeds_matrix.mean()) if speeds_matrix is not None else 55.0
    idx = int(np.abs(pred_means - input_mean).argmin())
    return idx


def _inference(sensors_data: list, timestamps: list) -> np.ndarray:
    """
    根据输入传感器数据选取最匹配的测试样本，返回速度矩阵。
    返回: ndarray [n_nodes, n_horizons]  (真实 mph)
    """
    n_nodes = _state["n_nodes"]

    if sensors_data:
        id_to_idx = _sensor_id_to_index()
        speed_last = np.full(n_nodes, 55.0, dtype=np.float32)
        for sensor in sensors_data:
            sid = str(sensor.get("sensor_id", ""))
            series = sensor.get("speed_series", [])
            if sid in id_to_idx and series:
                speed_last[id_to_idx[sid]] = float(series[-1])
        sample_idx = _pick_sample_by_speeds(speed_last)
    else:
        sample_idx = _state["current_sample_idx"]

    _state["current_sample_idx"] = sample_idx
    preds = _state["predictions"]    # [12, N, 207]
    speeds = preds[:, sample_idx, :].T   # [207, 12]
    return speeds


def _build_heatmap_points(speeds: np.ndarray, horizon_idx: int) -> list:
    """speeds: [n_nodes, n_horizons]，返回热力点列表。"""
    points = []
    for s in _state["sensor_meta"]:
        idx = s["index"]
        speed = float(speeds[idx, horizon_idx])
        heat = float(max(0.0, min(1.0, 1.0 - speed / V_FREE)))
        points.append({
            "sensor_id": s["sensor_id"],
            "index": idx,
            "lat": s["lat"],
            "lon": s["lon"],
            "pred_speed": round(speed, 2),
            "heat_value": round(heat, 4),
        })
    return points


# ─────────────────────────── API 路由 ───────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": bool(_state),
        "samples": _state.get("n_samples", 0),
        "horizons": _state.get("n_horizons", 0),
        "sensors": _state.get("n_nodes", 0),
        "backend": "npz-offline",
    })


@app.route("/predict", methods=["POST"])
def predict():
    """
    POST /predict
    请求体（可选）:
    {
      "timestamps": ["2026-04-10T16:00:00", ...],
      "sensors": [{"sensor_id": "773869", "speed_series": [65.2, ...]}]
    }
    """
    if not _state:
        return jsonify({"error": "数据尚未加载"}), 503

    data = request.get_json(force=True) or {}
    timestamps = data.get("timestamps", [])
    sensors_data = data.get("sensors", [])

    try:
        speeds = _inference(sensors_data, timestamps)
        _state["last_speeds"] = speeds
    except Exception as exc:
        logger.exception("推理失败")
        return jsonify({"error": str(exc)}), 500

    n_horizons = _state["n_horizons"]
    result = []
    for h_idx in range(n_horizons):
        result.append({
            "horizon": h_idx + 1,
            "points": _build_heatmap_points(speeds, h_idx),
        })

    return jsonify({
        "model": "models-2.9120-7875",
        "backend": "npz-offline",
        "horizons": list(range(1, n_horizons + 1)),
        "sample_index": int(_state["current_sample_idx"]),
        "result": result,
    })


@app.route("/heatmap", methods=["GET"])
def heatmap():
    """GET /heatmap?horizon=1&sample=33"""
    if not _state:
        return jsonify({"error": "数据尚未加载"}), 503

    try:
        horizon = int(request.args.get("horizon", 1))
        sample = int(request.args.get("sample", -1))
    except ValueError:
        return jsonify({"error": "horizon/sample 必须是整数"}), 400

    n_horizons = _state["n_horizons"]
    n_samples = _state["n_samples"]

    if horizon < 1 or horizon > n_horizons:
        return jsonify({"error": f"horizon 范围 [1, {n_horizons}]"}), 400

    preds = _state["predictions"]

    # 如果前端/后端明确传了 sample，就直接返回该样本对应的热力图
    if sample >= 0:
        sample_idx = max(0, min(sample, n_samples - 1))
        speeds = preds[:, sample_idx, :].T   # [207, 12]
        logger.info("heatmap using explicit sample=%d horizon=%d", sample_idx, horizon)
    else:
        # 否则保持原逻辑：优先用缓存，没有缓存就用当前样本
        speeds = _state.get("last_speeds")
        if speeds is None:
            sample_idx = _state["current_sample_idx"]
            speeds = preds[:, sample_idx, :].T
            _state["last_speeds"] = speeds
        else:
            sample_idx = _state["current_sample_idx"]
        logger.info("heatmap using cached/current sample=%d horizon=%d", sample_idx, horizon)

    return jsonify({
        "status": "ok",
        "backend": "npz-offline",
        "horizon": horizon,
        "sample_index": int(sample_idx),
        "points": _build_heatmap_points(speeds, horizon - 1),
    })

@app.route("/predict-and-cache", methods=["POST"])
def predict_and_cache():
    """POST /predict-and-cache — 预测并更新 /heatmap 缓存。"""
    if not _state:
        return jsonify({"error": "数据尚未加载"}), 503

    data = request.get_json(force=True) or {}
    try:
        speeds = _inference(data.get("sensors", []), data.get("timestamps", []))
        _state["last_speeds"] = speeds
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"status": "ok", "cached": True,
                    "sample_index": int(_state["current_sample_idx"])})


@app.route("/samples", methods=["GET"])
def list_samples():
    """返回可用测试样本数量及预测统计信息。"""
    if not _state:
        return jsonify({"error": "数据尚未加载"}), 503
    preds = _state["predictions"]
    return jsonify({
        "n_samples": _state["n_samples"],
        "n_horizons": _state["n_horizons"],
        "n_sensors": _state["n_nodes"],
        "speed_min": float(preds.min()),
        "speed_max": float(preds.max()),
        "speed_mean": round(float(preds.mean()), 2),
    })


# ─────────────────────────── 入口 ───────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DCRNN 推理服务（无 TF 版）")
    parser.add_argument(
        "--bundle-dir",
        default=os.path.dirname(os.path.abspath(__file__)),
        help="model_bundle 目录（含 sensor_meta.json / scaler.json）",
    )
    parser.add_argument(
        "--npz-path",
        default=r"d:\4C\dcrnn_predictions.npz",
        help="dcrnn_predictions.npz 的路径",
    )
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    bundle_dir = os.path.abspath(args.bundle_dir)
    npz_path = os.path.abspath(args.npz_path)
    logger.info("bundle_dir = %s", bundle_dir)
    logger.info("npz_path   = %s", npz_path)

    load_data(bundle_dir, npz_path)

    logger.info("推理服务启动在 http://%s:%d", args.host, args.port)
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
