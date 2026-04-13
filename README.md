# 🚦 Traffic Big Data Streaming Platform

## 📌 项目简介

本项目构建了一个基于 **Kafka + Flink + Redis + AI预测服务** 的城市交通实时数据处理与预测系统。

系统能够实现：

* 实时采集交通传感器数据
* Kafka 流式数据接入
* Flink 实时计算（流处理）
* 特征存储（Feature Store）
* AI模型预测（DCRNN）
* 前端热力图展示

👉 适用于：交通预测、智慧城市、流数据处理教学与竞赛项目

---

## 🧠 系统整体架构

```
┌──────────────┐
│  Sensor Data │
└──────┬───────┘
       ↓
┌──────────────┐
│ Kafka (raw)  │  topic: traffic.sensor.raw
└──────┬───────┘
       ↓
┌──────────────┐
│   Flink Job  │  实时流处理
└──────┬───────┘
       ↓
┌──────────────┐
│ Kafka (feat) │  topic: traffic.feature.windowed
└──────┬───────┘
       ↓
┌──────────────┐
│ FeatureStore │  (Redis)
└──────┬───────┘
       ↓
┌──────────────┐
│ Predict API  │
└──────┬───────┘
       ↓
┌──────────────┐
│ infer_service│ (DCRNN)
└──────┬───────┘
       ↓
┌──────────────┐
│   Frontend   │
└──────────────┘
```

---

## 🧩 技术栈

| 模块    | 技术              |
| ----- | --------------- |
| 流数据接入 | Kafka           |
| 流处理   | Flink           |
| 后端    | FastAPI         |
| 特征存储  | Redis           |
| 数据库   | MySQL / MongoDB |
| AI模型  | DCRNN           |
| 部署    | Docker Compose  |

---

## 📂 目录结构

```
traffic-dw/
├── compose/
│   └── streaming.yml        # Kafka + Flink 编排
├── scripts/                 # 启动 / 测试脚本（后续扩展）
├── README.md
```

---

## 🚀 快速启动

### 1️⃣ 启动流处理环境

```bash
cd /opt/traffic-dw/compose
docker compose -f streaming.yml up -d
```

---

### 2️⃣ 创建 Kafka Topics

```bash
docker exec -it traffic-kafka bash

/opt/kafka/bin/kafka-topics.sh --create \
  --topic traffic.sensor.raw \
  --bootstrap-server 127.0.0.1:9092 \
  --partitions 3 --replication-factor 1

/opt/kafka/bin/kafka-topics.sh --create \
  --topic traffic.feature.windowed \
  --bootstrap-server 127.0.0.1:9092 \
  --partitions 3 --replication-factor 1
```

---

### 3️⃣ 提交 Flink Job

```bash
docker cp flink-job.jar traffic-flink-jobmanager:/tmp/

docker exec -it traffic-flink-jobmanager \
  /opt/flink/bin/flink run -c com.traffic.App /tmp/flink-job.jar
```

---

## 📡 数据流说明

### 原始数据 Topic

```
traffic.sensor.raw
```

示例：

```json
{
  "node_id": "1001",
  "speed": 45.2,
  "flow": 130,
  "occupancy": 0.31
}
```

---

### Flink 输出 Topic

```
traffic.feature.windowed
```

当前阶段：

👉 透传（下一步升级为窗口聚合）

---

## 🔍 测试方法

### 发送数据

```bash
curl -X POST "http://127.0.0.1:8000/datastore/ingest/sensor" \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "1001",
    "speed": 48.5,
    "flow": 150,
    "occupancy": 0.36
  }'
```

---

### 查看 Flink 输出

```bash
docker exec -it traffic-kafka bash -lc "
/opt/kafka/bin/kafka-console-consumer.sh \
--bootstrap-server traffic-kafka:29092 \
--topic traffic.feature.windowed \
--from-beginning"
```

---

## ⚠️ 注意事项

### 1️⃣ Kafka 双监听

```
INTERNAL://traffic-kafka:29092   （容器通信）
EXTERNAL://127.0.0.1:9092       （宿主机访问）
```

---

### 2️⃣ Flink 必须使用内部地址

```java
.setBootstrapServers("traffic-kafka:29092")
```

---

### 3️⃣ 不上传镜像文件

仓库中不包含：

* Docker 镜像 tar
* Kafka 数据
* Flink state

---

## 🧪 当前进度

* ✅ Kafka 环境部署完成
* ✅ Flink 集群运行正常
* ✅ Flink Job 成功提交
* ✅ Kafka → Flink → Kafka 链路打通
* 🔄 下一步：窗口聚合计算

---

## 📈 下一步规划

* [ ] Flink 窗口聚合（核心）
* [ ] 替换 Python Consumer
* [ ] Feature Store 标准化
* [ ] 模型推理联动优化
* [ ] 系统自启动脚本
* [ ] 完整架构图（答辩）

---

## 👨‍💻 作者

* 项目：Traffic Big Data System
* 用途：课程设计 / 竞赛项目 / 实验教学

---

## ⭐ 项目亮点

* Kafka + Flink 实时流处理
* AI 交通预测（DCRNN）
* 前后端完整系统
* 可扩展大数据架构

---
