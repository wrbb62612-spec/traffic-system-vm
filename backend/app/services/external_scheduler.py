import asyncio
import logging

from app.core.config import Settings
from app.schemas.external_data import ExternalContextRequest, Location
from app.services.external_data import fetch_external_context
from app.services.external_store import save_external_snapshot

logger = logging.getLogger(__name__)


async def collect_and_store_once(settings: Settings) -> int:
    req = ExternalContextRequest(
        location=Location(
            lat=settings.external_default_lat,
            lon=settings.external_default_lon,
        ),
        radius_km=settings.external_default_radius_km,
        country_code=settings.external_default_country_code,
        state_code=settings.external_default_state_code,
        city=settings.external_default_city,
    )
    resp = fetch_external_context(req, settings)
    snapshot_id = save_external_snapshot(settings, req, resp)
    return snapshot_id


async def external_collection_loop(
    settings: Settings, stop_event: asyncio.Event
) -> None:
    interval = max(60, int(settings.external_collection_interval_sec))
    while not stop_event.is_set():
        try:
            snapshot_id = await collect_and_store_once(settings)
            logger.info("external snapshot saved: id=%s", snapshot_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception("external collection failed: %s", exc)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue
