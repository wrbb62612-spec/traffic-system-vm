#!/usr/bin/env python3
import json
import glob
import os
from collections import Counter


BASE_DIR = "/opt/traffic-dw/data/feature_export"


def to_float(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except Exception:
        return None


def main():
    pattern = os.path.join(BASE_DIR, "**", "*.jsonl")
    files = sorted(glob.glob(pattern, recursive=True))

    if not files:
        print("no exported jsonl files found")
        print("expected under:", BASE_DIR)
        return

    total_files = 0
    total_records = 0
    node_ids = set()
    feature_types = Counter()

    speed_values = []
    flow_values = []
    occupancy_values = []

    min_window_start = None
    max_window_end = None

    for path in files:
        total_files += 1
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                total_records += 1

                node_id = str(obj.get("node_id", "")).strip()
                if node_id:
                    node_ids.add(node_id)

                feature_type = str(obj.get("feature_type", "unknown"))
                feature_types[feature_type] += 1

                speed = to_float(obj.get("speed"))
                flow = to_float(obj.get("flow"))
                occupancy = to_float(obj.get("occupancy"))

                if speed is not None:
                    speed_values.append(speed)
                if flow is not None:
                    flow_values.append(flow)
                if occupancy is not None:
                    occupancy_values.append(occupancy)

                ws = obj.get("window_start")
                we = obj.get("window_end")

                if ws:
                    if min_window_start is None or ws < min_window_start:
                        min_window_start = ws
                if we:
                    if max_window_end is None or we > max_window_end:
                        max_window_end = we

    def avg(values):
        return round(sum(values) / len(values), 4) if values else None

    print("summary ok")
    print("base_dir            =", BASE_DIR)
    print("file_count          =", total_files)
    print("record_count        =", total_records)
    print("node_count          =", len(node_ids))
    print("node_ids            =", sorted(node_ids))
    print("feature_types       =", dict(feature_types))
    print("avg_speed           =", avg(speed_values))
    print("avg_flow            =", avg(flow_values))
    print("avg_occupancy       =", avg(occupancy_values))
    print("min_window_start    =", min_window_start)
    print("max_window_end      =", max_window_end)


if __name__ == "__main__":
    main()
