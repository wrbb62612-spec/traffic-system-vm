# traffic-system backend
## 目标
- 在 `traffic-system` 内提供独立后端服务（不侵入 `DCRNN` 训练仓）。
- 预留训练权重接入点，方便你在另一台机器完成训练后直接接入推理。
- 提供 LangGraph 多智能体编排骨架，并可调用千问兼容接口。
## 目录
```text
backend/
├── app/
│   ├── agents/         # LangGraph 状态与工作流
│   ├── api/routes/     # health / predict / agents
│   ├── core/           # 配置
│   ├── schemas/        # 请求响应模型
│   └── services/       # 预测器与Qwen客户端
├── .env.example
└── requirements.txt
```
## 启动
```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```
## 环境变量说明
- `QWEN_API_KEY`: 千问 API Key（你已在环境变量配置时可不写到 `.env`）
- `QWEN_MODEL`: 默认 `qwen3.5-plus`
- `QWEN_BASE_URL`: 默认 DashScope OpenAI 兼容地址
- `PREDICTOR_BACKEND`: `stub` / `dcrnn`
- `MODEL_WEIGHTS_PATH`: 训练产出的权重文件路径
- `WEATHER_USER_AGENT`: NWS 天气接口请求头（建议含联系方式）
- `NAGER_COUNTRY_CODE`: 节假日国家代码（默认 `US`）
- 外部数据已改为无 Key 方案：NWS / Nager.Date / Eventbrite 页面抓取 / OSM Overpass / LA Open Data
- `EXTERNAL_DB_PATH`: 外部数据 SQLite 文件路径
- `EXTERNAL_COLLECTION_ENABLED`: 是否启用后台定时采集
- `EXTERNAL_COLLECTION_INTERVAL_SEC`: 定时采集间隔（秒）
- `EXTERNAL_DEFAULT_*`: 定时任务默认抓取位置（默认洛杉矶市中心）
- `EXTERNAL_CACHE_*_TTL_SEC`: 各数据源缓存 TTL（秒），支持“抓取失败回退最近缓存”
## 接口
- `GET /health`: 健康检查
- `POST /predict`: 预测接口（支持占位或 dcrnn 权重接入）
- `POST /agents/run`: 运行多智能体流程（可选自动抓取 LA 外部数据）
- `POST /chat/stream`: 聊天流式回答（默认自动注入外部实时上下文，可传 `location`）
- `GET /external/requirements`: 查看外部数据源的凭据配置状态
- `POST /external/context`: 手动拉取外部上下文数据（天气/节假日/活动/POI/事故）
- `POST /external/collect`: 手动抓取并存库
- `GET /external/collect/default`: 用默认配置抓取并存库
- `GET /external/snapshots?limit=20`: 查看最近抓取快照
## 与 DCRNN 仓库解耦
当前后端只定义了 `DCRNNPredictor` 统一推理接口，不依赖你正在训练的仓库目录结构。  
后续你只需在 `app/services/predictor.py` 的 `DCRNNPredictor.predict()` 中接入真实加载与前向推理逻辑即可。
