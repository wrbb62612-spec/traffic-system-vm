import json
from kafka import KafkaProducer


class TrafficKafkaProducer:
    def __init__(self, bootstrap_servers: str):
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
            key_serializer=lambda v: str(v).encode("utf-8"),
        )

    def send(self, topic: str, key: str, value: dict):
        self.producer.send(topic, key=key, value=value)
        self.producer.flush()
