from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


ProviderName = Literal[
    "weather",
    "holiday",
    "events",
    "poi",
    "incidents",
]


class Location(BaseModel):
    lat: float = Field(description="纬度")
    lon: float = Field(description="经度")


class ExternalContextRequest(BaseModel):
    location: Location
    radius_km: float = Field(default=8.0, ge=0.5, le=100.0)
    country_code: str = Field(default="US", min_length=2, max_length=2)
    state_code: str = Field(default="CA", min_length=2, max_length=2)
    city: str = Field(default="Los Angeles")
    providers: list[ProviderName] = Field(
        default_factory=lambda: ["weather", "holiday", "events", "poi", "incidents"]
    )
    when: datetime | None = Field(
        default=None, description="分析时刻（ISO8601）；为空则使用当前UTC时间"
    )

    @model_validator(mode="after")
    def _normalize(self):
        if not self.when:
            self.when = datetime.now(timezone.utc)
        return self


class ProviderIssue(BaseModel):
    provider: str
    message: str


class ExternalContextResponse(BaseModel):
    fetched_at: datetime
    location: Location
    requested_providers: list[str]
    data: dict[str, Any]
    issues: list[ProviderIssue] = Field(default_factory=list)
    missing_credentials: dict[str, str] = Field(default_factory=dict)


class ProviderCredentialStatus(BaseModel):
    provider: str
    env_var: str | None = None
    configured: bool
    note: str


class ProviderRequirementsResponse(BaseModel):
    providers: list[ProviderCredentialStatus]


class ExternalSnapshot(BaseModel):
    id: int
    fetched_at: datetime
    lat: float
    lon: float
    radius_km: float
    country_code: str
    state_code: str
    city: str
    providers: list[str]
    data: dict[str, Any]
    issues: list[dict[str, Any]] = Field(default_factory=list)
    missing_credentials: dict[str, str] = Field(default_factory=dict)


class ExternalSnapshotListResponse(BaseModel):
    items: list[ExternalSnapshot]
