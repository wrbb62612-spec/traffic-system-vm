from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.kafka_producer import TrafficKafkaProducer

router = APIRouter(prefix="/datastore", tags=["streaming"])


class SensorIngestPayload(BaseModel):
    node_id: str
    timestamp: str | None = None
    speed: float
    flow: float
    occupancy: float
    source: str = "simulator"


class EventIngestPayload(BaseModel):
    event_id: str
    event_type: str
    severity: str
    road_name: str
    lat: float
    lon: float
    start_time: str | None = None
    description: str | None = None


class WeatherIngestPayload(BaseModel):
    station_id: str
    timestamp: str | None = None
    temperature: float
    rainfall: float
    wind_speed: float
    visibility: float


def _producer(settings: Settings) -> TrafficKafkaProducer:
    return TrafficKafkaProducer(settings.kafka_bootstrap_servers)


@router.get("/stream/health")
def stream_health(settings: Settings = Depends(get_settings)):
    return {
        "streaming_enabled": settings.streaming_enabled,
        "stream_mode": settings.stream_mode,
        "kafka_bootstrap_servers": settings.kafka_bootstrap_servers,
        "sensor_topic": settings.kafka_sensor_topic,
        "event_topic": settings.kafka_event_topic,
        "weather_topic": settings.kafka_weather_topic,
        "feature_topic": settings.kafka_feature_topic,
        "flink_rest_url": settings.flink_rest_url,
    }


@router.post("/ingest/sensor")
def ingest_sensor(payload: SensorIngestPayload, settings: Settings = Depends(get_settings)):
    try:
        producer = _producer(settings)
        msg = payload.model_dump()
        if not msg["timestamp"]:
            msg["timestamp"] = datetime.now(timezone.utc).isoformat()

        producer.send(
            topic=settings.kafka_sensor_topic,
            key=payload.node_id,
            value=msg,
        )

        return {
            "status": "ok",
            "topic": settings.kafka_sensor_topic,
            "partition_key": payload.node_id,
            "message": msg,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入 Kafka 失败: {e}")


@router.post("/ingest/event")
def ingest_event(payload: EventIngestPayload, settings: Settings = Depends(get_settings)):
    try:
        producer = _producer(settings)
        msg = payload.model_dump()
        if not msg["start_time"]:
            msg["start_time"] = datetime.now(timezone.utc).isoformat()

        producer.send(
            topic=settings.kafka_event_topic,
            key=payload.event_id,
            value=msg,
        )

        return {
            "status": "ok",
            "topic": settings.kafka_event_topic,
            "partition_key": payload.event_id,
            "message": msg,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入 Kafka 失败: {e}")


@router.post("/ingest/weather")
def ingest_weather(payload: WeatherIngestPayload, settings: Settings = Depends(get_settings)):
    try:
        producer = _producer(settings)
        msg = payload.model_dump()
        if not msg["timestamp"]:
            msg["timestamp"] = datetime.now(timezone.utc).isoformat()

        producer.send(
            topic=settings.kafka_weather_topic,
            key=payload.station_id,
            value=msg,
        )

        return {
            "status": "ok",
            "topic": settings.kafka_weather_topic,
            "partition_key": payload.station_id,
            "message": msg,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入 Kafka 失败: {e}")
