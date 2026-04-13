/**
 * 预处理脚本：从 DCRNN CSV 文件生成可直接 import 的 JS 数据模块
 *
 * 输入：
 *   ../../DCRNN/data/sensor_graph/graph_sensor_locations.csv  — 207 个传感器的 index/sensor_id/lat/lng
 *   ../../DCRNN/data/sensor_graph/distances_la_2012.csv       — PeMS 传感器两两路网距离 (from, to, cost)
 *
 * 输出：
 *   ../src/data/sensorData.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');

const LOCATIONS_FILE = path.join(ROOT, 'DCRNN/data/sensor_graph/graph_sensor_locations.csv');
const DISTANCES_FILE = path.join(ROOT, 'DCRNN/data/sensor_graph/distances_la_2012.csv');
const OUTPUT_FILE    = path.join(__dirname, '../src/data/sensorData.js');

// ── 1. 读取传感器位置 ────────────────────────────────────────────
const locLines = fs.readFileSync(LOCATIONS_FILE, 'utf8').trim().split('\n');
const sensors  = [];
const sensorIdSet = new Set();

for (let i = 1; i < locLines.length; i++) {
  const [idx, sensor_id, lat, lng] = locLines[i].split(',');
  const id = sensor_id.trim();
  sensors.push({
    index:    parseInt(idx),
    id,
    lat:  parseFloat(lat),
    lng:  parseFloat(lng),
  });
  sensorIdSet.add(id);
}

console.log(`传感器数量: ${sensors.length}`);

// ── 2. 读取距离矩阵，过滤出 207 传感器之间的边 ──────────────────
const distLines = fs.readFileSync(DISTANCES_FILE, 'utf8').trim().split('\n');

const DIST_THRESHOLD = 5000; // 仅保留 ≤5km 的直连路段
const edges = [];

for (let i = 1; i < distLines.length; i++) {
  const parts = distLines[i].split(',');
  const from = parts[0].trim();
  const to   = parts[1].trim();
  const cost = parseFloat(parts[2]);

  if (from === to) continue;                    // 自环
  if (!sensorIdSet.has(from)) continue;         // 不在207传感器集合中
  if (!sensorIdSet.has(to))   continue;
  if (cost > DIST_THRESHOLD)  continue;         // 超距离阈值

  edges.push({ from, to, cost });
}

console.log(`过滤后边数量 (≤${DIST_THRESHOLD}m): ${edges.length}`);

// ── 3. 计算地图中心 ─────────────────────────────────────────────
const avgLat = sensors.reduce((s, p) => s + p.lat, 0) / sensors.length;
const avgLng = sensors.reduce((s, p) => s + p.lng, 0) / sensors.length;
console.log(`地图中心: lng=${avgLng.toFixed(5)}, lat=${avgLat.toFixed(5)}`);

// ── 4. 构建 sensor_id → {lat,lng} 查找表（供边坐标解析用） ───────
const sensorMap = {};
for (const s of sensors) sensorMap[s.id] = { lat: s.lat, lng: s.lng };

// ── 5. 生成 JS 模块 ─────────────────────────────────────────────
const sensorsJson = JSON.stringify(sensors, null, 2);
const edgesJson   = JSON.stringify(edges,   null, 2);
const sensorMapJson = JSON.stringify(sensorMap);

const output = `/**
 * 自动生成 — 请勿手动修改
 * 来源: DCRNN/data/sensor_graph/graph_sensor_locations.csv
 *       DCRNN/data/sensor_graph/distances_la_2012.csv (≤5000m 边)
 * 传感器数: ${sensors.length}   边数: ${edges.length}
 * 地图中心: [${avgLng.toFixed(5)}, ${avgLat.toFixed(5)}]
 */

/** 207 个 METR-LA 传感器 (index, id, lat, lng) */
export const SENSORS = ${sensorsJson};

/** 传感器间路网距离边 (from/to 为 sensor_id, cost 单位: 米) */
export const EDGES = ${edgesJson};

/** sensor_id → {lat, lng} 快速查找 */
export const SENSOR_MAP = ${sensorMapJson};

/** 地图初始中心 */
export const MAP_CENTER = [${avgLng.toFixed(5)}, ${avgLat.toFixed(5)}];
`;

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
console.log(`已写出: ${OUTPUT_FILE}`);
