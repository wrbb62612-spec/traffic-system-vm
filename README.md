traffic-system-vm

基于虚拟机部署的城市交通智能预测与可视化系统。

本项目面向城市交通拥堵预测与辅助决策场景，当前已经完成前端、后端、推理服务、大数据底座、实时流处理、Feature Store、预测缓存以及离线归档链路的联通与验证，形成了一个“可运行、可演示、可扩展”的工程化原型系统。

---

1. 项目简介

本系统的核心目标是构建一个面向城市交通场景的综合智能预测平台，支持：

- 城市路网可视化展示
- 实时传感器数据接入与流处理
- 基于 DCRNN 的交通预测
- Feature Store 驱动预测
- 预测结果缓存与热力图展示
- 离线归档与轻量批处理统计
- 为后续多智能体协同决策提供数据与预测基础

当前系统已在 Ubuntu Server 虚拟机中完成部署，并已实现实时链路和离线链路的分层运行。

---

2. 当前最新状态

2.1 已稳定可用的主链路

当前已经稳定可用的主系统链路为：

前端 → FastAPI 后端 → Redis Feature Store → infer_service → Redis 预测缓存 → 前端热力图展示

当前已经验证通过：

- 前端大屏可运行
- FastAPI 后端可运行
- infer_service 可运行
- Redis / MySQL / MongoDB 可运行
- Feature Store current/history 可读写
- /datastore/predict/from-feature-store 已跑通
- Redis 预测缓存已生成
- 前端热力图可读取缓存展示

2.2 已跑通的实时流处理链路

当前实时链路已经跑通：

Kafka 原始主题 traffic.sensor.raw  

→ Flink 窗口聚合 Job  

→ Kafka 特征主题 traffic.feature.windowed  

→ Python consumer  

→ Redis Feature Store  

→ 后端预测接口

当前已经验证：

- /datastore/ingest/sensor 可写入 Kafka
- Flink Job 可运行
- traffic.feature.windowed 可输出窗口聚合结果
- Redis 中已生成 feature:node:{id}:history
- 后端可从 Redis 历史窗口触发预测

2.3 第三阶段已新增并验证的离线链路

当前已经新增并验证的第三阶段离线链路为：

Redis Feature Store  

→ MinIO 离线归档  

→ 本地下载  

→ 轻量离线批处理统计

当前已经完成：

- MinIO 对象存储部署
- Redis 历史窗口导出到 MinIO
- MinIO 归档对象下载到本地目录
- 本地轻量批处理脚本读取 jsonl 并输出统计摘要

---

3. 当前实现架构

系统当前可分为 6 层：

3.1 前端展示层

- React + Vite
- 城市交通大屏
- 地图热力图展示
- Feature Store 调试面板
- Redis 预测缓存联动展示

3.2 业务后端层

- FastAPI
- 提供业务接口、预测接口、数据接口
- 从 Redis 读取历史窗口特征
- 调用独立推理服务
- 将预测结果回写 Redis / MongoDB

3.3 推理服务层

- model_bundle/infer_service.py
- 当前为 replay 模式
- 基于 dcrnn_predictions.npz 提供 npz-offline 推理能力
- 提供 /health、/predict、/heatmap、/predict-and-cache

3.4 数据底座层

- Redis：Feature Store、预测缓存
- MySQL：结构化业务数据
- MongoDB：预测记录、非结构化结果

3.5 实时流处理层

- Kafka：原始流与特征流主题
- Flink：窗口聚合与实时特征构建
- consumer：从 Kafka 特征主题写入 Redis Feature Store

3.6 离线仓库与批处理层

- MinIO：离线对象存储
- 本地批处理脚本：轻量统计与离线分析入口
- 后续可继续扩展为 Spark / 训练集构建 / 模型资产管理

---

4. 项目目录结构

    traffic-system-vm/
    ├── src/                                   # 前端源码
    │   ├── api/                               # 前端接口封装
    │   ├── components/                        # 通用组件
    │   ├── pages/                             # 页面
    │   └── data/                              # 前端静态数据
    │
    ├── backend/                               # FastAPI 后端
    │   ├── app/
    │   │   ├── api/routes/                    # 路由层
    │   │   ├── core/                          # 配置层
    │   │   └── services/                      # 服务层
    │   ├── data/
    │   ├── requirements.txt
    │   └── .env
    │
    ├── model_bundle/                          # DCRNN 推理服务与模型资产
    │   ├── infer_service.py
    │   ├── dcrnn_predictions.npz
    │   ├── sensor_meta.json
    │   ├── scaler.json
    │   ├── adj_mx.pkl
    │   ├── graph_sensor_locations.csv
    │   ├── config_20.yaml
    │   ├── checkpoint/
    │   └── manifest.json
    │
    ├── flink-job/                             # Flink Job Maven 工程
    │
    ├── scripts/
    │   ├── backend/
    │   │   └── start_backend_dcrnn.sh         # 启动后端并切换为 dcrnn 预测器
    │   ├── model/
    │   │   ├── start_infer_service_mode.sh    # 按模式启动 infer_service
    │   │   └── check_infer_service.sh         # 检查 infer_service 健康状态
    │   ├── offline/
    │   │   ├── start_offline_infra.sh         # 启动离线底座
    │   │   ├── run_offline_pipeline.sh        # 一键跑离线归档与统计
    │   │   ├── export_redis_history_to_minio.py
    │   │   └── download_feature_from_minio.py
    │   └── streaming/
    │       └── consume_sensor_to_redis.py     # Kafka 特征流写入 Redis
    │
    ├── docs/
    │   ├── infer_service_mode.md
    │   └── stage3_offline_progress.md
    │
    └── README.md

---

5. 运行环境

操作系统

- Ubuntu Server 22.04

前端

- Node.js
- npm
- Vite
- React

后端

- Python 3.10
- FastAPI
- Uvicorn

推理服务

- Python
- Flask
- NumPy

大数据与存储

- Docker
- Redis
- MySQL
- MongoDB
- Kafka
- Flink
- MinIO

---

6. 固定启动流程（当前稳定版）

建议按下面顺序启动，避免链路未就绪导致接口报错。

6.1 终端 1：启动数据库、对象存储与流处理底座

    cd /opt/traffic-dw/compose
    
    # 基础数据库底座
    docker compose up -d
    
    # 离线对象存储
    docker compose -f offline.yml up -d
    
    # Kafka + Flink
    docker compose -f streaming.yml up -d

检查状态：

    docker compose ps
    docker compose -f offline.yml ps
    docker compose -f streaming.yml ps
    docker ps

至少应看到：

- redis-fs
- mysql-traffic
- mongo-traffic
- traffic-minio
- traffic-kafka
- traffic-flink-jobmanager
- traffic-flink-taskmanager

---

6.2 终端 2：启动前端

    cd /opt/traffic-system
    npm install
    npm run dev -- --host 0.0.0.0 --port 5173

访问地址：

    http://127.0.0.1:5173

---

6.3 终端 3：启动 replay 模式推理服务

    cd /opt/traffic-system/backend
    source venv/bin/activate
    
    export INFER_SERVICE_MODE=replay
    export INFER_SERVICE_PORT=5001
    export INFER_SERVICE_REPLAY_NPZ=/opt/traffic-system/model_bundle/dcrnn_predictions.npz
    
    /opt/traffic-system/scripts/model/start_infer_service_mode.sh

健康检查：

    cd /opt/traffic-system/backend
    source venv/bin/activate
    export INFER_SERVICE_PORT=5001
    /opt/traffic-system/scripts/model/check_infer_service.sh

说明：

- 当前默认使用 replay 模式
- 当前底层 backend 为 npz-offline
- live 模式当前仅预留入口，尚未提供稳定实现

---

6.4 终端 4：启动后端（dcrnn 模式）

推荐直接使用脚本：

    /opt/traffic-system/scripts/backend/start_backend_dcrnn.sh

它会自动将后端切到：

- PREDICTOR_BACKEND=dcrnn
- INFER_SERVICE_URL=http://127.0.0.1:5001

接口文档：

    http://127.0.0.1:8000/docs

如果只想手动启动：

    cd /opt/traffic-system/backend
    source venv/bin/activate
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

---

6.5 终端 5：启动 Kafka → Redis consumer

    cd /opt/traffic-system/backend
    source venv/bin/activate
    python /opt/traffic-system/scripts/streaming/consume_sensor_to_redis.py

正常输出示例：

    consumer started... topic=traffic.feature.windowed

---

6.6 终端 6：编译并提交 Flink Job

    cd /opt/traffic-system/flink-job/flink-job
    mvn clean package

复制 JAR 到 JobManager 容器：

    docker cp target/flink-job-1.0.jar traffic-flink-jobmanager:/tmp/flink-job-1.0.jar

提交作业：

    docker exec -it traffic-flink-jobmanager bash -lc "/opt/flink/bin/flink run -c com.traffic.App /tmp/flink-job-1.0.jar"

检查作业状态：

    docker exec -it traffic-flink-jobmanager bash -lc "/opt/flink/bin/flink list"

如果看到：

    Traffic Flink Job (RUNNING)

说明 Flink 作业正常运行。

---

7. Kafka Topic 初始化

如果 Kafka 容器重建过，建议检查 topic 是否存在。

检查：

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --list --bootstrap-server 127.0.0.1:9092"

如缺失则创建：

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.sensor.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.event.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.weather.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.feature.windowed --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"

---

8. 固定验证流程

系统全部启动后，建议按下面顺序验证。

8.1 检查数据库底座

    curl http://127.0.0.1:8000/datastore/health

8.2 检查流式配置

    curl http://127.0.0.1:8000/datastore/stream/health

8.3 检查推理服务健康状态

    cd /opt/traffic-system/backend
    source venv/bin/activate
    export INFER_SERVICE_PORT=5001
    /opt/traffic-system/scripts/model/check_infer_service.sh

8.4 写入一条实时传感器数据

    curl -X POST "http://127.0.0.1:8000/datastore/ingest/sensor" \
      -H "Content-Type: application/json" \
      -d '{
        "node_id": "1001",
        "speed": 49.2,
        "flow": 152,
        "occupancy": 0.37,
        "source": "simulator"
      }'

8.5 查看 Flink 输出 topic

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server traffic-kafka:29092 --topic traffic.feature.windowed --from-beginning"

8.6 检查 Redis Feature Store

    curl "http://127.0.0.1:8000/datastore/feature/current/1001"
    curl "http://127.0.0.1:8000/datastore/feature/history/1001?steps=12"

8.7 测试后端预测器是否为 dcrnn

    curl -X POST "http://127.0.0.1:8000/predict" \
      -H "Content-Type: application/json" \
      -d '{
        "dataset": "METR-LA",
        "horizons": [1, 3, 6, 12]
      }'

如果返回中包含：

    "backend": "dcrnn"

说明后端已经切换为 dcrnn 预测器。

8.8 从 Feature Store 触发预测

    curl -X POST "http://127.0.0.1:8000/datastore/predict/from-feature-store?node_ids=1001&steps=12"

如果返回中包含：

- source = redis-feature-store
- infer_service_result
- redis_cache_key

说明 Feature Store 驱动预测链路已正常。

8.9 查看预测缓存

    curl "http://127.0.0.1:8000/datastore/predict/cache/latest?node_ids=1001"

---

9. 第三阶段离线链路运行方式

如果只想验证离线仓库与离线批处理入口，可直接运行：

    /opt/traffic-system/scripts/offline/run_offline_pipeline.sh

该脚本会自动完成：

1. 启动 MinIO 与基础底座
2. 等待 MinIO / Redis 就绪
3. 将 Redis 历史窗口导出到 MinIO
4. 从 MinIO 下载归档到本地
5. 运行本地轻量批处理统计
6. 列出 MinIO 中的归档对象

当前已验证通过的统计示例包括：

- file_count = 3
- record_count = 32
- node_count = 1
- node_ids = ['1001']

---

10. 推理服务模式说明

当前系统将推理服务区分为两种模式：

10.1 replay 模式

- 当前已实现
- 使用 dcrnn_predictions.npz
- 适合演示、答辩、离线样本回放
- 当前默认模式

10.2 live 模式

- 当前预留
- 目标是未来接入真实在线前向推理
- 当前仓库尚未提供稳定可运行实现

---

11. 当前限制

当前系统虽然已经具备较完整的工程原型能力，但仍存在以下限制：

- infer_service.py 当前仍为 replay 模式
- 当前 backend = npz-offline，尚未切换到真实 live 前向推理
- 部分前端页面仍保留静态数据
- systemd 自启动还未全面收口
- README 与文档仍需继续同步到当前最新状态
- 多节点联合预测、自动周期刷新、训练样本构建仍可继续增强

---

12. 当前项目现状总结

当前系统已经完成：

- 前端 + 后端 + 推理服务联合运行
- Redis / MySQL / MongoDB 大数据底座接入
- Kafka / Flink 实时流处理链路打通
- Redis Feature Store 驱动预测
- Redis 预测缓存与前端热力图联动
- 后端 dcrnn 预测器联调完成
- replay 模式推理服务规范化
- MinIO 离线仓库落地
- Redis → MinIO → 本地离线批处理链路落地

当前最准确的一句话总结是：

项目已经从“可演示原型”升级为“实时链路 + 离线归档 + 模式化推理”的工程化初版。

---

13. 后续计划

下一阶段建议重点推进：

- 将 infer_service 从 replay 逐步升级到 live
- 将前端 DataViz 静态数据页切换为真实接口
- 增加 systemd / 自启动脚本
- 补齐 README 与阶段文档同步
- 增加多节点联合预测与自动刷新机制

---

14. GitHub 仓库

当前项目仓库：

    https://github.com/wrbb62612-spec/traffic-system-vm
