from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Traffic Intelligence Backend"
    app_version: str = "0.1.0"

    qwen_api_key: str | None = None
    qwen_model: str = "qwen3.5-plus"
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    predictor_backend: str = "stub"
    model_weights_path: str | None = None

    infer_service_url: str = "http://localhost:5001"
    infer_service_timeout: int = 30

    offline_heatmap_path: str = "data/offline_heatmap.json"
    model_bundle_path: str = "../model_bundle"

    mission_db_path: str = "data/missions.db"
    rag_db_path: str = "data/rag.db"

    weather_user_agent: str = "traffic-system/0.1 (contact: admin@example.com)"
    nager_country_code: str = "US"
    external_db_path: str = "data/external_data.db"
    external_collection_enabled: bool = True
    external_collection_interval_sec: int = 300
    external_default_lat: float = 34.0522
    external_default_lon: float = -118.2437
    external_default_radius_km: float = 8.0
    external_default_city: str = "Los Angeles"
    external_default_state_code: str = "CA"
    external_default_country_code: str = "US"
    external_cache_weather_ttl_sec: int = 300
    external_cache_holiday_ttl_sec: int = 86400
    external_cache_events_ttl_sec: int = 1800
    external_cache_poi_ttl_sec: int = 21600
    external_cache_incidents_ttl_sec: int = 300

    redis_host: str = "127.0.0.1"
    redis_port: int = 6379

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_database: str = "traffic_db"
    mysql_user: str = "traffic_user"
    mysql_password: str = "Traffic2026!"

    mongo_uri: str = "mongodb://admin:Traffic2026!@127.0.0.1:27017/traffic_events?authSource=admin"


@lru_cache
def get_settings() -> Settings:
    return Settings()
