import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha1
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import Settings
from app.schemas.external_data import (
    ExternalContextRequest,
    ExternalContextResponse,
    ProviderCredentialStatus,
    ProviderIssue,
    ProviderRequirementsResponse,
)
from app.services.external_store import (
    get_cached_provider_payload,
    upsert_cached_provider_payload,
)


DEFAULT_TIMEOUT_SECONDS = 12


def _json_get(
    url: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    query = urlencode({k: v for k, v in (params or {}).items() if v is not None})
    final_url = f"{url}?{query}" if query else url
    last_error = None
    for _ in range(3):
        try:
            req = Request(final_url, headers=headers or {})
            with urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
                body = resp.read().decode("utf-8")
            return json.loads(body)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    raise RuntimeError(f"GET JSON failed after retries: {final_url}: {last_error}")


def _text_get(
    url: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> str:
    query = urlencode({k: v for k, v in (params or {}).items() if v is not None})
    final_url = f"{url}?{query}" if query else url
    last_error = None
    for _ in range(3):
        try:
            req = Request(final_url, headers=headers or {})
            with urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    raise RuntimeError(f"GET TEXT failed after retries: {final_url}: {last_error}")


@dataclass(frozen=True)
class ProviderRequirement:
    provider: str
    env_var: str | None
    note: str


REQUIREMENTS = [
    ProviderRequirement(
        provider="weather",
        env_var=None,
        note="NWS 无需密钥；建议配置 WEATHER_USER_AGENT。",
    ),
    ProviderRequirement(
        provider="holiday",
        env_var=None,
        note="Nager.Date 公共假期接口默认无需密钥。",
    ),
    ProviderRequirement(
        provider="events",
        env_var=None,
        note="使用 Eventbrite 公开页面结构化数据抓取，无需密钥。",
    ),
    ProviderRequirement(
        provider="poi",
        env_var=None,
        note="使用 OpenStreetMap Overpass API，无需密钥。",
    ),
    ProviderRequirement(
        provider="incidents",
        env_var=None,
        note="使用 LA Open Data 交通碰撞数据（Socrata），无需密钥。",
    ),
]


def provider_requirements(_settings: Settings) -> ProviderRequirementsResponse:
    providers = [
        ProviderCredentialStatus(
            provider=req.provider,
            env_var=req.env_var,
            configured=True,
            note=req.note,
        )
        for req in REQUIREMENTS
    ]
    return ProviderRequirementsResponse(providers=providers)


def _fetch_weather(ctx: ExternalContextRequest, settings: Settings) -> dict[str, Any]:
    headers = {"User-Agent": settings.weather_user_agent}
    lat, lon = ctx.location.lat, ctx.location.lon
    point = _json_get(f"https://api.weather.gov/points/{lat},{lon}", headers=headers)
    props = point.get("properties", {})
    forecast_hourly_url = props.get("forecastHourly")
    alert_url = "https://api.weather.gov/alerts/active"
    result: dict[str, Any] = {
        "point": {
            "forecast": props.get("forecast"),
            "forecastHourly": forecast_hourly_url,
            "gridId": props.get("gridId"),
            "gridX": props.get("gridX"),
            "gridY": props.get("gridY"),
        }
    }

    if forecast_hourly_url:
        hourly = _json_get(forecast_hourly_url, headers=headers)
        periods = hourly.get("properties", {}).get("periods", [])[:6]
        result["next_hours"] = [
            {
                "startTime": p.get("startTime"),
                "temperature": p.get("temperature"),
                "temperatureUnit": p.get("temperatureUnit"),
                "windSpeed": p.get("windSpeed"),
                "windDirection": p.get("windDirection"),
                "shortForecast": p.get("shortForecast"),
            }
            for p in periods
        ]

    alerts = _json_get(
        alert_url,
        params={"point": f"{lat},{lon}"},
        headers=headers,
    )
    features = alerts.get("features", [])[:10]
    result["alerts"] = [
        {
            "event": f.get("properties", {}).get("event"),
            "severity": f.get("properties", {}).get("severity"),
            "certainty": f.get("properties", {}).get("certainty"),
            "headline": f.get("properties", {}).get("headline"),
            "effective": f.get("properties", {}).get("effective"),
            "ends": f.get("properties", {}).get("ends"),
        }
        for f in features
    ]
    return result


def _fetch_holiday(ctx: ExternalContextRequest) -> dict[str, Any]:
    year = ctx.when.year if isinstance(ctx.when, datetime) else datetime.utcnow().year
    holidays = _json_get(
        f"https://date.nager.at/api/v3/publicholidays/{year}/{ctx.country_code}"
    )
    if not isinstance(holidays, list):
        holidays = []
    current_date = ctx.when.date().isoformat()
    today = [h for h in holidays if h.get("date") == current_date]
    return {
        "year": year,
        "countryCode": ctx.country_code,
        "today": today,
        "next_10": holidays[:10],
    }


def _fetch_events(
    ctx: ExternalContextRequest, _settings: Settings
) -> tuple[dict[str, Any] | None, str | None]:
    # 无 Key：抓取 Eventbrite 列表页内嵌 JSON-LD（ItemList）
    city_slug = ctx.city.lower().replace(" ", "-")
    state_slug = ctx.state_code.lower()
    url = f"https://www.eventbrite.com/d/{state_slug}--{city_slug}/events/"
    html = _text_get(url, headers={"User-Agent": "Mozilla/5.0"})
    blocks = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    events: list[dict[str, Any]] = []
    for block in blocks:
        try:
            obj = json.loads(block.strip())
        except Exception:  # noqa: BLE001
            continue
        if isinstance(obj, dict) and obj.get("@type") == "ItemList":
            for element in obj.get("itemListElement", []):
                item = element.get("item", {})
                if item.get("@type") != "Event":
                    continue
                loc = item.get("location", {}) or {}
                geo = loc.get("geo", {}) or {}
                events.append(
                    {
                        "name": item.get("name"),
                        "startDateTime": item.get("startDate"),
                        "endDateTime": item.get("endDate"),
                        "venue": loc.get("name"),
                        "url": item.get("url"),
                        "location": {
                            "lat": geo.get("latitude"),
                            "lon": geo.get("longitude"),
                        },
                    }
                )
    events = events[:30]
    return {
        "count": len(events),
        "source": url,
        "events": events,
    }, None


def _fetch_poi(
    ctx: ExternalContextRequest, _settings: Settings
) -> tuple[dict[str, Any] | None, str | None]:
    # 无 Key：Overpass 查询周边 POI
    radius_m = int(ctx.radius_km * 1000)
    query = (
        "[out:json][timeout:25];("
        f"node(around:{radius_m},{ctx.location.lat},{ctx.location.lon})[amenity];"
        f"node(around:{radius_m},{ctx.location.lat},{ctx.location.lon})[shop];"
        f"node(around:{radius_m},{ctx.location.lat},{ctx.location.lon})[tourism];"
        f"node(around:{radius_m},{ctx.location.lat},{ctx.location.lon})[public_transport];"
        ");out body 80;"
    )
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    overpass = None
    last_error = None
    for endpoint in endpoints:
        try:
            req = Request(
                endpoint,
                data=query.encode("utf-8"),
                headers={"Content-Type": "text/plain"},
            )
            with urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS + 15) as resp:
                overpass = json.loads(resp.read().decode("utf-8"))
            source_endpoint = endpoint
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    if overpass is None:
        raise RuntimeError(f"Overpass all endpoints failed: {last_error}")
    elements = overpass.get("elements", [])
    pois = []
    for e in elements[:80]:
        tags = e.get("tags", {})
        pois.append(
            {
                "name": tags.get("name"),
                "category": tags.get("amenity")
                or tags.get("shop")
                or tags.get("tourism")
                or tags.get("public_transport"),
                "tags": tags,
                "location": {"lat": e.get("lat"), "lon": e.get("lon")},
            }
        )
    return {
        "count": len(pois),
        "source": source_endpoint,
        "pois": pois,
    }, None


def _fetch_incidents(
    ctx: ExternalContextRequest, _settings: Settings
) -> tuple[dict[str, Any] | None, str | None]:
    # 无 Key：LA Open Data（Socrata）交通碰撞数据
    # 数据集: d5tf-ez2w
    radius_m = int(ctx.radius_km * 1000)
    where = (
        f"within_circle(location_1, {ctx.location.lat}, {ctx.location.lon}, {radius_m})"
    )
    params = {
        "$select": "dr_no,date_occ,time_occ,crm_cd_desc,location,cross_street,location_1",
        "$where": where,
        "$order": "date_occ DESC",
        "$limit": 50,
    }
    incidents = _json_get(
        "https://data.lacity.org/resource/d5tf-ez2w.json", params=params
    )
    if not isinstance(incidents, list):
        incidents = []
    return {
        "radius_m": radius_m,
        "count": len(incidents),
        "source": "https://data.lacity.org/resource/d5tf-ez2w.json",
        "incidents": incidents[:30],
    }, None


def fetch_external_context(
    req: ExternalContextRequest, settings: Settings
) -> ExternalContextResponse:
    data: dict[str, Any] = {}
    issues: list[ProviderIssue] = []
    missing_credentials: dict[str, str] = {}

    ttl_map = {
        "weather": settings.external_cache_weather_ttl_sec,
        "holiday": settings.external_cache_holiday_ttl_sec,
        "events": settings.external_cache_events_ttl_sec,
        "poi": settings.external_cache_poi_ttl_sec,
        "incidents": settings.external_cache_incidents_ttl_sec,
    }

    def _cache_key(provider: str) -> str:
        base = {
            "provider": provider,
            "lat": round(req.location.lat, 4),
            "lon": round(req.location.lon, 4),
            "radius_km": round(req.radius_km, 2),
            "country_code": req.country_code,
            "state_code": req.state_code,
            "city": req.city,
            "date": req.when.date().isoformat() if req.when else None,
        }
        return sha1(json.dumps(base, sort_keys=True).encode("utf-8")).hexdigest()

    def _expired(expires_at: str) -> bool:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            return True
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp <= datetime.now(timezone.utc)

    def _fetch_and_cache(provider: str, fn):
        ck = _cache_key(provider)
        cached = get_cached_provider_payload(settings, provider, ck)
        if cached and not _expired(cached["expires_at"]):
            return cached["payload"]
        try:
            payload = fn()
            now = datetime.now(timezone.utc)
            exp = now + timedelta(seconds=max(60, int(ttl_map[provider])))
            upsert_cached_provider_payload(
                settings=settings,
                provider=provider,
                cache_key=ck,
                updated_at=now.isoformat(),
                expires_at=exp.isoformat(),
                payload=payload,
            )
            return payload
        except Exception as exc:  # noqa: BLE001
            if cached:
                issues.append(
                    ProviderIssue(
                        provider=provider,
                        message=f"实时抓取失败，已回退缓存: {exc}",
                    )
                )
                return cached["payload"]
            raise

    for provider in req.providers:
        try:
            if provider == "weather":
                data["weather"] = _fetch_and_cache(
                    "weather", lambda: _fetch_weather(req, settings)
                )
            elif provider == "holiday":
                data["holiday"] = _fetch_and_cache("holiday", lambda: _fetch_holiday(req))
            elif provider == "events":
                payload = _fetch_and_cache(
                    "events", lambda: _fetch_events(req, settings)[0] or {}
                )
                data["events"] = payload
            elif provider == "poi":
                payload = _fetch_and_cache("poi", lambda: _fetch_poi(req, settings)[0] or {})
                data["poi"] = payload
            elif provider == "incidents":
                payload = _fetch_and_cache(
                    "incidents", lambda: _fetch_incidents(req, settings)[0] or {}
                )
                data["incidents"] = payload
        except Exception as exc:  # noqa: BLE001
            issues.append(ProviderIssue(provider=provider, message=str(exc)))

    return ExternalContextResponse(
        fetched_at=datetime.now(timezone.utc),
        location=req.location,
        requested_providers=req.providers,
        data=data,
        issues=issues,
        missing_credentials=missing_credentials,
    )
