db = db.getSiblingDB('traffic_events');

db.createCollection('llm_reasoning_snapshots');
db.llm_reasoning_snapshots.createIndex({ event_id: 1 });
db.llm_reasoning_snapshots.createIndex({ timestamp: -1 });

db.createCollection('external_event_snapshots');
db.external_event_snapshots.createIndex({ source: 1, captured_at: -1 });
