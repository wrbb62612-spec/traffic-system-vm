from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.external_data import (
    ExternalContextRequest,
    ExternalContextResponse,
    ExternalSnapshotListResponse,
    ExternalSnapshot,
    ProviderRequirementsResponse,
)
from app.services.external_data import fetch_external_context, provider_requirements
from app.services.external_scheduler import collect_and_store_once
from app.services.external_store import (
    get_external_snapshot_by_id,
    list_external_snapshots,
    save_external_snapshot,
)

router = APIRouter(prefix="/external", tags=["external"])


@router.get("/requirements", response_model=ProviderRequirementsResponse)
def requirements(settings: Settings = Depends(get_settings)):
    return provider_requirements(settings)


@router.post("/context", response_model=ExternalContextResponse)
def external_context(
    req: ExternalContextRequest, settings: Settings = Depends(get_settings)
):
    return fetch_external_context(req, settings)


@router.post("/collect", response_model=ExternalSnapshot)
async def collect(req: ExternalContextRequest, settings: Settings = Depends(get_settings)):
    resp = fetch_external_context(req, settings)
    snapshot_id = save_external_snapshot(settings, req, resp)
    snapshot = get_external_snapshot_by_id(settings, snapshot_id)
    if snapshot is None:
        # 理论上不会发生，兜底返回一次最近记录
        snapshot = list_external_snapshots(settings, limit=1)[0]
    return ExternalSnapshot(**snapshot)


@router.get("/collect/default", response_model=dict)
async def collect_default(settings: Settings = Depends(get_settings)):
    snapshot_id = await collect_and_store_once(settings)
    return {"ok": True, "snapshot_id": snapshot_id}


@router.get("/snapshots", response_model=ExternalSnapshotListResponse)
def snapshots(limit: int = 20, settings: Settings = Depends(get_settings)):
    safe_limit = min(max(limit, 1), 200)
    items = [ExternalSnapshot(**item) for item in list_external_snapshots(settings, safe_limit)]
    return ExternalSnapshotListResponse(items=items)
