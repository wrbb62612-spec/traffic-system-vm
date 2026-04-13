"""
预测器抽象层。

DCRNNPredictor 通过 HTTP 调用独立的 infer_service.py（Python 3.6 + TF1 进程），
不在主后端进程中直接加载 TensorFlow，从而兼容 Python 3.13 运行时。

infer_service.py 启动方式：
    cd d:/4C/DCRNN
    python ../traffic-system/model_bundle/infer_service.py --bundle-dir ../traffic-system/model_bundle --port 5001

配置项（.env）：
    INFER_SERVICE_URL=http://localhost:5001
    PREDICTOR_BACKEND=dcrnn
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta

import numpy as np
import requests

from app.schemas.predict import (
    PredictRequest,
    PredictResponse,
    SensorPrediction,
    speed_to_congestion,
)

DATASET_SENSOR_COUNT = {
    "METR-LA": 207,
    "PEMS-BAY": 325,
}

HORIZON_MINUTES = {1: 5, 3: 15, 6: 30, 12: 60}


def _build_response(
    dataset: str,
    backend: str,
    weights_loaded: bool,
    speed_matrix: np.ndarray,
    horizons: list[int],
    notes: str,
) -> PredictResponse:
    """将 [N, H] 速度矩阵转换为统一响应格式。"""
    n_sensors, n_horizons = speed_matrix.shape
    horizons_min = [HORIZON_MINUTES.get(h, h * 5) for h in horizons]

    sensor_preds = [
        SensorPrediction(
            sensor_index=i,
            speed_mph=[round(float(speed_matrix[i, h]), 2) for h in range(n_horizons)],
            congestion_level=[
                speed_to_congestion(speed_matrix[i, h]) for h in range(n_horizons)
            ],
        )
        for i in range(n_sensors)
    ]

    avg_speeds = speed_matrix.mean(axis=0).tolist()
    severe_counts = [
        int((speed_matrix[:, h] < 15).sum()) for h in range(n_horizons)
    ]

    return PredictResponse(
        dataset=dataset,
        backend=backend,
        weights_loaded=weights_loaded,
        horizons_min=horizons_min,
        num_sensors=n_sensors,
        predictions=sensor_preds,
        summary={
            "avg_speed_mph": [round(v, 2) for v in avg_speeds],
            "severe_congestion_sensors": severe_counts,
            "horizons_min": horizons_min,
        },
        notes=notes,
    )


class Predictor(ABC):
    @abstractmethod
    def predict(self, req: PredictRequest) -> PredictResponse:
        raise NotImplementedError


class StubPredictor(Predictor):
    """
    占位预测器：生成符合 DCRNN 输出格式的随机合理速度，
    用于前后端联调，训练完成接入真实权重前使用。
    """

    def predict(self, req: PredictRequest) -> PredictResponse:
        n_sensors = DATASET_SENSOR_COUNT.get(req.dataset, 207)
        n_horizons = len(req.horizons)

        rng = np.random.default_rng(42)

        if req.speeds:
            # 以输入历史速度的均值为基准模拟衰减
            history = np.array(req.speeds, dtype=float)  # [N, T]
            n_sensors = min(history.shape[0], n_sensors)
            base = history[:n_sensors, -1]  # 最近一步速度作为基准
        else:
            base = rng.uniform(30, 70, size=n_sensors)

        # 模拟随时间略微下降的速度（高峰期拥堵加剧）
        decay = np.linspace(1.0, 0.92, n_horizons)
        noise = rng.normal(0, 1.5, size=(n_sensors, n_horizons))
        speed_matrix = np.clip(
            base[:, None] * decay[None, :] + noise, 5.0, 85.0
        ).astype(float)

        return _build_response(
            dataset=req.dataset,
            backend="stub",
            weights_loaded=False,
            speed_matrix=speed_matrix,
            horizons=req.horizons,
            notes=(
                f"占位预测器（{req.dataset}，{n_sensors} 传感器）。"
                "训练权重就绪后设置 PREDICTOR_BACKEND=dcrnn 并指定 MODEL_WEIGHTS_PATH 即可切换。"
            ),
        )


class DCRNNPredictor(Predictor):
    """
    DCRNN 真实推理器。

    通过 HTTP 调用独立的 infer_service.py（Python 3.6 + TF1 进程），
    不在主后端进程中直接加载 TensorFlow。

    启动 infer_service.py 后，在 .env 中设置：
        INFER_SERVICE_URL=http://localhost:5001
        PREDICTOR_BACKEND=dcrnn
    """

    def __init__(self, infer_service_url: str, timeout: int = 30):
        self.base_url = infer_service_url.rstrip("/")
        self.timeout = timeout

    def _check_health(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/health", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    def predict(self, req: PredictRequest) -> PredictResponse:
        if not self._check_health():
            raise ValueError(
                f"infer_service 不可达（{self.base_url}）。"
                "请先在 DCRNN 环境中启动 model_bundle/infer_service.py。"
            )

        n_sensors = DATASET_SENSOR_COUNT.get(req.dataset, 207)

        # 若未提供历史速度，用中等速度占位
        if req.speeds:
            speeds_np = np.array(req.speeds, dtype=float)
            if speeds_np.shape[0] != n_sensors:
                speeds_np = np.full((n_sensors, 12), 55.0, dtype=float)
        else:
            speeds_np = np.full((n_sensors, 12), 55.0, dtype=float)

        # 构造时间戳列表（最近 12 步，5 分钟间隔）
        now = datetime.utcnow()
        timestamps = [
            (now - timedelta(minutes=5 * (12 - i))).isoformat()
            for i in range(12)
        ]

        # 组装 sensors 列表
        sensors_payload = [
            {
                "sensor_id": str(i),
                "speed_series": speeds_np[i].tolist(),
            }
            for i in range(n_sensors)
        ]

        payload = {"timestamps": timestamps, "sensors": sensors_payload}
        try:
            resp = requests.post(
                f"{self.base_url}/predict",
                json=payload,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            raise ValueError(f"调用 infer_service 失败: {exc}") from exc

        # 解析结果 → [N, H] 速度矩阵
        horizon_steps = req.horizons
        n_horizons = len(horizon_steps)

        result_by_horizon: dict[int, dict[int, float]] = {}
        for entry in data.get("result", []):
            h = entry["horizon"]
            result_by_horizon[h] = {p["index"]: p["pred_speed"] for p in entry["points"]}

        speed_matrix = np.zeros((n_sensors, n_horizons), dtype=float)
        for col_idx, h in enumerate(horizon_steps):
            horizon_data = result_by_horizon.get(h, {})
            for row in range(n_sensors):
                speed_matrix[row, col_idx] = horizon_data.get(row, 55.0)

        return _build_response(
            dataset=req.dataset,
            backend="dcrnn",
            weights_loaded=True,
            speed_matrix=speed_matrix,
            horizons=req.horizons,
            notes=f"DCRNN 推理完成（via infer_service @ {self.base_url}）",
        )
