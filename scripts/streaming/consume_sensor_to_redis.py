import json
from datetime import datetime, timezone

import redis
from kafka import KafkaConsumer

REDIS_HOST = "127.0.0.1"
REDIS_PORT = 6379
KAFKA_BOOTSTRAP = "127.0.0.1:9092"
TOPIC = "traffic.sensor.raw"

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

consumer = KafkaConsumer(
    TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP,
    group_id="traffic-feature-consumer",
    auto_offset_reset="latest",
    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
)

print("consumer started...")

for msg in consumer:
    data = msg.value
    node_id = str(data["node_id"])
    speed = float(data.get("speed", 0.0))
    timestamp = data.get("timestamp") or datetime.now(timezone.utc).isoformat()

    now = datetime.now(timezone.utc)
    time_of_day = (now.hour * 3600 + now.minute * 60 + now.second) / 86400.0

    current_key = f"feature:node:{node_id}:current"
    history_key = f"feature:node:{node_id}:history"

    current_doc = {
        "speed": speed,
        "time_of_day": time_of_day,
        "updated_at": timestamp,
    }

    history_doc = {
        "speed": speed,
        "time_of_day": time_of_day,
        "updated_at": timestamp,
    }

    r.hset(current_key, mapping=current_doc)
    r.expire(current_key, 3600)

    r.lpush(history_key, json.dumps(history_doc, ensure_ascii=False))
    r.ltrim(history_key, 0, 11)
    r.expire(history_key, 7200)

    print(f"[OK] node={node_id}, speed={speed}, ts={timestamp}")
