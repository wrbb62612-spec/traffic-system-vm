"""
DCRNN 推理接口 Schema

DCRNN 输入约定：
  - dataset:    "METR-LA" | "PEMS-BAY"
  - speeds:     shape [N, T] 的二维数组，N=传感器数，T=12（过去1小时，5min间隔），单位 mph
  - horizons:   需要预测的步数列表，默认 [1, 3, 6, 12]（对应 5/15/30/60 min）

DCRNN 输出约定：
  - predictions: shape [N, H]，每个传感器在 H 个预测步上的速度（mph）
  - mae / mape / rmse: 若提供真值则计算，否则为 None
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    dataset: Literal["METR-LA", "PEMS-BAY"] = Field(
        default="METR-LA",
        description="数据集名称，决定传感器数量（METR-LA=207，PEMS-BAY=325）",
    )
    speeds: list[list[float]] = Field(
        default_factory=list,
        description="历史速度矩阵，shape [N, 12]，单位 mph，N=传感器数量",
    )
    horizons: list[int] = Field(
        default=[1, 3, 6, 12],
        description="预测步数（1步=5min），[1,3,6,12] 对应 5/15/30/60 分钟",
    )
    meta: dict[str, Any] = Field(default_factory=dict)


class SensorPrediction(BaseModel):
    sensor_index: int
    speed_mph: list[float] = Field(description="各 horizon 对应的预测速度（mph）")
    congestion_level: list[str] = Field(description="各 horizon 对应的拥堵等级")


class PredictResponse(BaseModel):
    dataset: str
    backend: str
    weights_loaded: bool
    horizons_min: list[int] = Field(description="各预测步对应的分钟数")
    num_sensors: int
    predictions: list[SensorPrediction]
    summary: dict[str, Any] = Field(description="全路网摘要统计")
    notes: str


def speed_to_congestion(speed_mph: float) -> str:
    """将速度映射到拥堵等级（基于高速公路经验阈值）。"""
    if speed_mph >= 60:
        return "free"
    elif speed_mph >= 45:
        return "light"
    elif speed_mph >= 30:
        return "moderate"
    elif speed_mph >= 15:
        return "heavy"
    return "severe"
