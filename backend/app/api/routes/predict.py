import json
import os
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
import requests

from app.core.config import Settings, get_settings
from app.schemas.predict import PredictRequest, PredictResponse
from app.services.model_registry import build_predictor

router = APIRouter(prefix="/predict", tags=["predict"])

NUM_NODES = 207
V_FREE = 70.0  # 自由流速度阈值（mph），用于热力值计算


# ────────────── 离线热力图辅助 ──────────────

@lru_cache(maxsize=1)
def _load_offline_heatmap(path: str) -> list[dict]:
    """加载离线热力图 JSON，结果缓存于进程内存中。"""
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        return []
    with open(abs_path, encoding="utf-8") as f:
        return json.load(f)


def _load_sensor_meta(bundle_path: str) -> list[dict]:
    meta_path = os.path.join(os.path.abspath(bundle_path), "sensor_meta.json")
    if not os.path.exists(meta_path):
        return []
    with open(meta_path, encoding="utf-8") as f:
        return json.load(f)


def _fetch_infer_service_heatmap(
    settings: Settings,
    horizon: int,
    sample: int = -1,
) -> dict | None:
    url = f"{settings.infer_service_url.rstrip('/')}/heatmap"
    try:
        params = {"horizon": horizon}
        if sample >= 0:
            params["sample"] = sample

        response = requests.get(
            url,
            params=params,
            timeout=min(settings.infer_service_timeout, 10),
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload.get("points"), list) or not payload["points"]:
            return None

        payload["source"] = "infer_service"
        payload["source_label"] = "在线推理服务"
        payload["backend"] = "dcrnn"
        payload["is_live_model"] = True
        return payload
    except Exception:
        return None


# ────────────── 路由 ──────────────

@router.post("", response_model=PredictResponse)
def predict(req: PredictRequest, settings: Settings = Depends(get_settings)):
    """在线推理（调用 DCRNN infer_service 或占位预测器）。"""
    try:
        predictor = build_predictor(settings)
        return predictor.predict(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/heatmap")
def get_heatmap(
    horizon: int = Query(default=1, ge=1, le=12, description="预测步（1=5min … 12=60min）"),
    sample: int = Query(default=-1, description="样本索引，-1 表示使用最近一个样本"),
    settings: Settings = Depends(get_settings),
):
    """
    热力图接口（离线模式）。

    返回指定 horizon 下 207 个传感器的预测速度与热力值。
    sample=-1 取最后一个样本（最近时刻）。
    """
    predictor_backend = settings.predictor_backend.strip().lower()
    if predictor_backend == "dcrnn":
        proxied_payload = _fetch_infer_service_heatmap(settings, horizon, sample)
        if proxied_payload is not None:
            return JSONResponse(proxied_payload)

    records = _load_offline_heatmap(settings.offline_heatmap_path)
    if not records:
        raise HTTPException(
            status_code=503,
            detail=(
                f"离线热力图数据不存在（{settings.offline_heatmap_path}）。"
                "请确认后端 data/ 目录下存在 offline_heatmap.json。"
            ),
        )

    # 找出全部样本索引
    sample_indices = sorted({r["sample_index"] for r in records})
    if not sample_indices:
        raise HTTPException(status_code=404, detail="数据为空")

    target_sample = sample_indices[-1] if sample == -1 else sample
    if target_sample not in sample_indices:
        raise HTTPException(
            status_code=404,
            detail=f"sample_index={target_sample} 不存在，可用范围: {sample_indices[0]}~{sample_indices[-1]}",
        )

    matched = [
        r for r in records
        if r["sample_index"] == target_sample and r["horizon"] == horizon
    ]
    if not matched:
        raise HTTPException(
            status_code=404,
            detail=f"sample={target_sample} horizon={horizon} 没有匹配数据",
        )

    entry = matched[0]
    return JSONResponse({
        "horizon": horizon,
        "sample_index": target_sample,
        "total_samples": len(sample_indices),
        "points": entry["points"],
        "source": "offline_heatmap",
        "source_label": "离线热力图回放",
        "backend": predictor_backend,
        "is_live_model": False,
    })


@router.get("/heatmap/samples")
def list_heatmap_samples(settings: Settings = Depends(get_settings)):
    """返回离线热力图可用的 sample_index 列表及 horizon 范围。"""
    records = _load_offline_heatmap(settings.offline_heatmap_path)
    if not records:
        return JSONResponse({"samples": [], "horizons": []})

    samples = sorted({r["sample_index"] for r in records})
    horizons = sorted({r["horizon"] for r in records})
    return JSONResponse({"samples": samples, "horizons": horizons})


@router.get("/sensors")
def get_sensor_meta(settings: Settings = Depends(get_settings)):
    """返回 207 个传感器的元信息（index / sensor_id / lat / lon）。"""
    meta = _load_sensor_meta(settings.model_bundle_path)
    if not meta:
        raise HTTPException(
            status_code=503,
            detail=(
                f"sensor_meta.json 不存在（{settings.model_bundle_path}）。"
                "请确认 model_bundle 目录配置正确。"
            ),
        )
    return JSONResponse({"count": len(meta), "sensors": meta})


@router.get("/infer-service/health")
def infer_service_health(settings: Settings = Depends(get_settings)):
    """探测 DCRNN infer_service 是否在线。"""
    import requests as _req
    url = f"{settings.infer_service_url.rstrip('/')}/health"
    try:
        r = _req.get(url, timeout=3)
        return JSONResponse({"online": r.status_code == 200, "url": url, "detail": r.json()})
    except Exception as exc:
        return JSONResponse({"online": False, "url": url, "detail": str(exc)})
