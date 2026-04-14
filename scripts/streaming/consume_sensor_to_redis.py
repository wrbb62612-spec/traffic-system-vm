import json
import os
import time
from datetime import datetime
from kafka import KafkaConsumer
import redis

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:9092")
TOPIC = os.getenv("KAFKA_TOPIC", "traffic.feature.windowed")
GROUP_ID = os.getenv("KAFKA_GROUP_ID", "traffic-feature-consumer")
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
HISTORY_LIMIT = int(os.getenv("FEATURE_HISTORY_LIMIT", "12"))
DEFAULT_WINDOW_SECONDS = int(os.getenv("WINDOW_SECONDS", "10"))

def utc_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def to_float(value, default=None):
    if value is None or value == "":
        return default
    return float(value)

def parse_time_of_day(ts_text):
    try:
        dt = datetime.fromisoformat(str(ts_text).replace("Z", "+00:00"))
        seconds = dt.hour * 3600 + dt.minute * 60 + dt.second
        return seconds / 86400.0
    except Exception:
        return datetime.utcnow().hour / 24.0

def main():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=GROUP_ID,
        auto_offset_reset="latest",
        enable_auto_commit=True,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
    )
    print(f"consumer started... topic={TOPIC}")

    for msg in consumer:
        try:
            data = msg.value
            node_id = str(data["node_id"])

            speed = to_float(data.get("speed", data.get("avg_speed")), 0.0)
            flow = to_float(data.get("flow", data.get("avg_flow")))
            occupancy = to_float(data.get("occupancy", data.get("avg_occupancy")))

            updated_at = data.get("updated_at") or data.get("window_end") or utc_iso()

            time_of_day = data.get("time_of_day")
            if time_of_day is None:
                time_of_day = parse_time_of_day(updated_at)
            time_of_day = round(float(time_of_day), 4)

            current_key = f"feature:node:{node_id}:current"
            history_key = f"feature:node:{node_id}:history"

            current_doc = {
                "node_id": node_id,
                "speed": str(speed),
                "flow": "" if flow is None else str(flow),
                "occupancy": "" if occupancy is None else str(occupancy),
                "time_of_day": str(time_of_day),
                "updated_at": str(updated_at),
                "window_start": str(data.get("window_start", "")),
                "window_end": str(data.get("window_end", "")),
                "sample_count": str(data.get("sample_count", "")),
                "feature_type": str(data.get("feature_type", "windowed")),
                "window_size_sec": str(data.get("window_size_sec", DEFAULT_WINDOW_SECONDS)),
            }

            history_doc = {
                "node_id": node_id,
                "speed": speed,
                "flow": flow,
                "occupancy": occupancy,
                "time_of_day": time_of_day,
                "updated_at": str(updated_at),
                "window_start": data.get("window_start"),
                "window_end": data.get("window_end"),
                "sample_count": data.get("sample_count"),
                "feature_type": data.get("feature_type", "windowed"),
                "window_size_sec": data.get("window_size_sec", DEFAULT_WINDOW_SECONDS),
            }

            r.hset(current_key, mapping=current_doc)
            r.lpush(history_key, json.dumps(history_doc))
            r.ltrim(history_key, 0, HISTORY_LIMIT - 1)

            print(
                f"[consumer] node={node_id} speed={speed} flow={flow} "
                f"occupancy={occupancy} samples={data.get('sample_count')} "
                f"window_end={data.get('window_end')} topic={TOPIC}"
            )
        except Exception as e:
            print(f"[consumer] error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()