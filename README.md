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
