# traffic-system-vm

基于虚拟机部署的城市交通智能预测与可视化系统。  
本项目完成了前后端联调、DCRNN 预测服务接入，并在此基础上接入 Redis / MySQL / MongoDB 大数据底座，形成了 **Feature Store → 预测服务 → Redis 缓存 → 前端热力图展示** 的完整链路。

---

## 1. 项目简介

本系统面向城市交通拥堵预测与辅助决策场景，核心能力包括：

- 交通路网可视化展示
- 基于 DCRNN 的拥堵预测热力图展示
- Feature Store（Redis）特征读写
- 后端从 Feature Store 触发预测
- 预测结果缓存与回写
- 大屏前端联动展示

当前版本已完成在 Ubuntu Server 虚拟机中的部署与运行，并已上传到 GitHub 进行版本管理。

---

## 2. 当前实现架构

系统整体由以下几部分组成：

### 前端
- React + Vite
- 交通大屏展示
- 地图热力图展示
- Feature Store 调试面板
- 预测缓存加载与联动

### 后端
- FastAPI
- 提供业务接口、预测接口、数据存储接口
- 从 Redis 中读取历史窗口
- 调用 DCRNN 推理服务
- 将预测结果写回 Redis / MongoDB

### 预测服务
- `model_bundle/infer_service.py`
- 当前版本为 **npz-offline 推理服务**
- 使用预先生成的预测结果文件进行离线预测回放 / 匹配
- 支持 `/health`、`/predict`、`/heatmap` 等接口

### 大数据底座
- **Redis**
  - 作为 Feature Store
  - 存储 current / history 特征
  - 缓存最近一次预测结果
- **MySQL**
  - 存储结构化业务数据
  - 存储系统配置与报告索引
- **MongoDB**
  - 存储预测记录
  - 存储非结构化事件 / 推理快照

---

## 3. 当前已经完成的能力

### 基础部署
- [x] Ubuntu Server 虚拟机部署
- [x] Xshell / Xftp 远程连接
- [x] Node.js / npm 环境安装
- [x] Python venv 环境安装
- [x] Docker 环境安装

### 系统运行
- [x] 前端成功运行
- [x] FastAPI 后端成功运行
- [x] DCRNN 推理服务成功运行
- [x] 前后端联调成功

### 大数据底座
- [x] Redis 容器部署
- [x] MySQL 容器部署
- [x] MongoDB 容器部署
- [x] `/datastore/health` 三库连通检查成功

### Feature Store 与预测链路
- [x] Redis current 特征写入 / 读取
- [x] Redis history 特征写入 / 读取
- [x] DCRNN 输入预览接口
- [x] 从 Feature Store 触发预测
- [x] 预测结果回写 Redis 缓存
- [x] 预测结果写入 MongoDB
- [x] 前端热力图读取 Redis 预测缓存并展示

---

## 4. 项目目录结构

```text
traffic-system-vm/
├── src/                            # 前端源码
│   ├── api/                        # 前端接口封装
│   ├── components/                 # 通用组件
│   ├── pages/                      # 页面
│   │   └── Dashboard/              # 大屏页面与地图组件
│   └── data/                       # 前端静态数据
│
├── backend/                        # FastAPI 后端
│   ├── app/
│   │   ├── api/routes/             # 路由层
│   │   ├── core/                   # 配置层
│   │   └── services/               # 服务层
│   ├── data/                       # 本地运行数据
│   └── venv/                       # 后端虚拟环境（本地部署）
│
├── model_bundle/                   # DCRNN 推理服务与模型相关文件
│   ├── infer_service.py
│   ├── sensor_meta.json
│   ├── scaler.json
│   ├── adj_mx.pkl
│   └── dcrnn_predictions.npz
│
├── scripts/                        # VM 启动脚本、Docker 脚本等
└── README.md
```

---

## 5. 运行环境

操作系统  
Ubuntu Server 22.04  

前端  
Node.js  
npm  

后端  
Python 3.10  
FastAPI  
Uvicorn  

大数据底座  
Docker  
Redis  
MySQL  
MongoDB  

---

## 6. 启动方式

### 6.1 启动前端

```bash
cd /opt/traffic-system
npm run dev -- --host 0.0.0.0 --port 5173
```

浏览器访问：

```
http://127.0.0.1:5173
```

### 6.2 启动后端

```bash
cd /opt/traffic-system/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

接口文档：

```
http://127.0.0.1:8000/docs
```

### 6.3 启动 DCRNN 推理服务

```bash
cd /opt/traffic-system/model_bundle
source venv/bin/activate
python infer_service.py --npz-path /opt/traffic-system/model_bundle/dcrnn_predictions.npz --port 5001
```

健康检查：

```
http://127.0.0.1:5001/health
```

### 6.4 启动大数据底座

```bash
cd /opt/traffic-dw/compose
docker compose up -d
docker compose ps
```

---

## 7. 关键接口说明

### 7.1 数据底座健康检查

```
GET /datastore/health
```

功能：

检查 Redis / MySQL / MongoDB 是否可用

### 7.2 读取当前特征

```
GET /datastore/feature/current/{node_id}
```

示例：

```
GET /datastore/feature/current/1001
```

### 7.3 写入当前特征

```
POST /datastore/feature/current/{node_id}
```

请求体示例：

```json
{
  "speed": 35.5,
  "time_of_day": 0.42
}
```

### 7.4 读取历史特征

```
GET /datastore/feature/history/{node_id}
```

示例：

```
GET /datastore/feature/history/1001
```

### 7.5 写入历史特征

```
POST /datastore/feature/history/{node_id}
```

请求体示例：

```json
{
  "speed": 35.5,
  "time_of_day": 0.42
}
```

### 7.6 DCRNN 输入预览

```
GET /datastore/feature/dcrnn-input?node_ids=1001&steps=12
```

功能：

从 Redis 历史窗口中读取特征  
按时间顺序组装为模型输入预览

### 7.7 从 Feature Store 触发预测

```
POST /datastore/predict/from-feature-store?node_ids=1001&steps=12
```

功能：

从 Redis 读取历史窗口  
转发给 infer_service  
返回预测结果  
同时将预测结果回写 Redis 缓存与 MongoDB

### 7.8 获取最新预测缓存

```
GET /datastore/predict/cache/latest?node_ids=1001
```

功能：

从 Redis 中读取最近一次预测缓存  
前端热力图优先使用该缓存结果

---

## 8. 当前前端联动逻辑

当前前端大屏已接入缓存预测链路：

在调试面板中写入 history 特征  
调用 Run Predict + Load Cache  
后端从 Redis 读取历史窗口  
调用 DCRNN 推理服务  
将预测结果写入 Redis 缓存  
MapView 优先读取 Redis 缓存热力图点  
地图热力图完成刷新展示

当前页面中可看到：

Redis 预测缓存  
缓存点数  
Redis 缓存预测 +5min / +15min / +30min / +60min

---

## 9. 当前版本说明

### 已实现
- VM 部署
- 前后端运行
- DCRNN 推理服务接入
- Redis / MySQL / MongoDB 接入
- Feature Store 驱动预测
- Redis 缓存预测热力图联动展示

### 当前限制
- 当前 `infer_service.py` 仍为 npz-offline 模式
- 即使用预先生成的预测结果进行样本匹配 / 回放
- 目前尚未切换为真实 TensorFlow checkpoint 在线前向推理

---

## 10. 后续计划

- 将调试按钮收口为正式业务按钮
- 支持自动刷新预测缓存
- 支持更多节点 / 多节点联合预测
- 将结果更完整地落入 MongoDB / MySQL
- 接入 Kafka / Flink 等实时流处理组件
- 升级为真实在线 DCRNN 推理服务

---

## 11. GitHub 仓库

当前项目仓库：

https://github.com/wrbb62612-spec/traffic-system-vm

---

## 12. 说明

本项目当前版本重点在于：

完成系统在 VM 环境中的可运行部署  
完成大数据底座与业务系统的联通  
完成从 Feature Store 到预测热力图展示的完整链路验证

因此，它已经具备较强的演示价值、答辩价值和后续扩展基础。

## 13. 固定启动流程（当前稳定版）

建议严格按下面顺序启动。

当前系统的稳定运行依赖：前端、后端、推理服务、数据库底座、Kafka/Flink、consumer、Flink Job。

其中前端 / 后端 / 推理服务的基础启动方式与当前运行记录一致 ，主仓库 README 也已经记录了基础启动入口和主系统结构 。

---

### 13.1 启动顺序总览

固定顺序如下：

1. 启动数据库与流处理底座
2. 启动前端
3. 启动后端
4. 启动 DCRNN 推理服务
5. 启动 Kafka → Redis consumer
6. 编译并提交 Flink Job
7. 验证 Kafka / Redis / 预测链路

---

### 13.2 终端 1：启动数据库与流处理底座

1）启动基础数据库底座

    cd /opt/traffic-dw/compose
    docker compose up -d

2）启动 Kafka + Flink

    cd /opt/traffic-dw/compose
    docker compose -f streaming.yml up -d

3）检查容器状态

    docker compose ps
    docker compose -f streaming.yml ps
    docker ps

正常情况下应至少看到：

- redis-fs
- mysql-traffic
- mongo-traffic
- traffic-kafka
- traffic-flink-jobmanager
- traffic-flink-taskmanager

---

### 13.3 终端 2：启动前端

    cd /opt/traffic-system
    npm install
    npm run dev -- --host 0.0.0.0 --port 5173

浏览器访问：

    http://127.0.0.1:5173

当前运行记录中也已固定建议前端使用该命令启动

---

### 13.4 终端 3：启动后端

    cd /opt/traffic-system/backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

接口文档：

    http://127.0.0.1:8000/docs

当前运行规范中也已固定后端以 uvicorn app.main:app 启动

---

### 13.5 终端 4：启动 DCRNN 推理服务

    cd /opt/traffic-system/model_bundle
    python3 -m venv venv
    source venv/bin/activate
    pip install flask numpy
    python infer_service.py --npz-path /opt/traffic-system/model_bundle/dcrnn_predictions.npz --port 5001

健康检查：

    curl http://127.0.0.1:5001/health

注意：当前 infer_service.py 必须显式指定 --npz-path，否则可能读取到错误的旧路径。

---

### 13.6 终端 5：启动 Kafka → Redis consumer

当前稳定版系统里，这一步仍然是必须的。

因为 Redis Feature Store 还需要 consumer 持续把 Kafka 数据写入：

    cd /opt/traffic-system/backend
    source venv/bin/activate
    python /opt/traffic-system/scripts/streaming/consume_sensor_to_redis.py

正常启动后会看到：

    consumer started...

---

### 13.7 终端 6：编译并提交 Flink Job

1）编译 Flink Job

    cd /opt/traffic-system/flink-job/flink-job
    mvn clean package

2）复制 JAR 到 JobManager 容器

    docker cp target/flink-job-1.0.jar traffic-flink-jobmanager:/tmp/flink-job-1.0.jar

3）提交作业

    docker exec -it traffic-flink-jobmanager bash -lc "/opt/flink/bin/flink run -c com.traffic.App /tmp/flink-job-1.0.jar"

4）检查作业状态

    docker exec -it traffic-flink-jobmanager bash -lc "/opt/flink/bin/flink list"

如果看到：

    Traffic Flink Job (RUNNING)

说明 Flink 作业正常运行。

---

### 13.8 Kafka Topic 初始化

如果 Kafka 容器是新建的，建议启动后检查 topic 是否存在。

检查 topic

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --list --bootstrap-server 127.0.0.1:9092"

如不存在则创建

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.sensor.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.event.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.weather.raw --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"
    
    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --create --topic traffic.feature.windowed --bootstrap-server 127.0.0.1:9092 --partitions 3 --replication-factor 1"

---

### 13.9 固定验证流程

系统全部启动后，建议按下面顺序验证。

1）检查数据库底座

    curl http://127.0.0.1:8000/datastore/health

2）检查流处理配置

    curl http://127.0.0.1:8000/datastore/stream/health

3）发送一条实时传感器数据

    curl -X POST "http://127.0.0.1:8000/datastore/ingest/sensor" \
      -H "Content-Type: application/json" \
      -d '{
        "node_id": "1001",
        "speed": 49.2,
        "flow": 152,
        "occupancy": 0.37,
        "source": "simulator"
      }'

4）查看 Flink 输出 topic

    docker exec -it traffic-kafka bash -lc "/opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server traffic-kafka:29092 --topic traffic.feature.windowed --from-beginning"

5）检查 Redis Feature Store

    curl "http://127.0.0.1:8000/datastore/feature/current/1001"
    curl "http://127.0.0.1:8000/datastore/feature/history/1001?steps=12"

6）触发预测

    curl -X POST "http://127.0.0.1:8000/datastore/predict/from-feature-store?node_ids=1001&steps=12"

7）查看预测缓存

    curl "http://127.0.0.1:8000/datastore/predict/cache/latest?node_ids=1001"

---

## 14. 仓库当前状况说明

### 14.1 主仓库定位

当前主仓库 traffic-system-vm 主要负责系统主体，包含：

- 前端 src/
- 后端 backend/
- 模型推理服务 model_bundle/
- 启动脚本与辅助文件 scripts/
- 项目说明文档 README.md

主仓库 README 已经记录了：

- 项目简介
- 当前架构
- 前后端与推理服务启动方式
- Redis / MySQL / MongoDB 基础底座
- Feature Store → 预测 → Redis缓存 → 前端热力图 的主链路

---

### 14.2 当前仓库“已稳定”的部分

以下内容已经可以视为稳定基线：

主系统链路

- React + Vite 前端可运行
- FastAPI 后端可运行
- infer_service.py 可运行
- Redis / MySQL / MongoDB 可运行
- Feature Store current/history 可读写
- /datastore/predict/from-feature-store 可成功触发预测
- Redis 预测缓存可生成
- 前端热力图可读取缓存展示

这些能力已经在主仓库 README 中有基础说明

---

### 14.3 当前仓库“二阶段新增”的部分

本地 VM 里已经完成，但 README 尚未完全同步的部分包括：

大数据流处理侧

- Kafka 已部署并可用
- Flink JobManager / TaskManager 已部署并可用
- Flink Job 已成功 RUNNING
- traffic.sensor.raw -> traffic.feature.windowed 已打通
- /datastore/ingest/sensor 已能把数据写入 Kafka
- Kafka → Redis consumer 已可运行
- Kafka / Redis / Feature Store / Predict 已形成闭环

也就是说，本地系统实际状态已经比 GitHub main 上的 README 更靠前一阶段。

---

### 14.4 当前目录分工

/opt/traffic-system

主系统目录，负责：

- 前端页面
- FastAPI 后端
- 推理服务
- Flink Job 源码
- Kafka consumer 脚本

/opt/traffic-dw

大数据平台侧目录，负责：

- Docker Compose 编排
- Kafka / Flink 运行环境
- 后续的大数据平台 README、启动脚本、自启脚本

建议后续继续保持这种分层：

- traffic-system：应用系统
- traffic-dw：平台与部署

---

### 14.5 当前仍在进行中的部分

以下内容已经开始，但还没有作为最终稳定版完全收口：

- Flink 当前还是透传版 Job
- Flink 还未升级到窗口聚合版
- Python consumer 还没有完全替换为消费 traffic.feature.windowed
- 自启动脚本与 systemd 服务还没补完
- README 还没有完全同步“二阶段实际状态”

---

## 15. 当前版本一句话总结

当前系统已经完成：

前端 + 后端 + 推理服务 + Redis/MySQL/MongoDB + Kafka/Flink + Feature Store + 预测缓存 的联合运行。

其中：

- 主系统链路已经稳定可用
- 二阶段实时流处理链路已经打通
- 当前处于“从 Flink 透传版升级到 Flink 窗口聚合版”的过渡阶段

---


