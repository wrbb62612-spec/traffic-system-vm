import json
import os

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.schemas.external_data import ExternalContextRequest, Location
from app.services.external_data import fetch_external_context

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """你是城市路网高峰拥堵全链路溯源与多主体协同管控智能决策系统的 AI 助手。

【预测模型】
核心预测模型为 DCRNN（Diffusion Convolutional Recurrent Neural Network，ICLR 2018），基于扩散卷积在路网图上建模交通流的时空依赖。
模型以 12 步历史速度数据（过去 1 小时，5 分钟间隔）作为输入，输出未来 12 步（5/15/30/60 分钟）的路网速度预测。

【数据集】
- METR-LA：洛杉矶高速公路网络，207 个传感器，速度单位 mph，时间跨度 2012 年 3-6 月
- PEMS-BAY：旧金山湾区，325 个传感器，速度单位 mph，时间跨度 2017 年 1-5 月

【模型性能参考（原论文复现）】
METR-LA：MAE 2.18 / 2.67 / 3.08 / 3.56（5/15/30/60min），MAPE 5.17% / 6.84% / 8.38% / 10.30%
PEMS-BAY：MAE 0.85 / 1.31 / 1.66 / 1.98（5/15/30/60min），MAPE 1.63% / 2.74% / 3.76% / 4.74%

【多智能体集群】
系统由六类核心 Agent（全局协调、信控优化、交通管控、公共交通、出行服务、仿真评估）通过 LangGraph 状态图协同工作。
全局协调 Agent 接收 DCRNN 预测输出，将路网拥堵态势自然语言化后分发给各专业 Agent，最终生成一体化管控方案。

【外部实时数据】
当系统提供了“外部实时上下文”（天气、节假日、活动、POI、事故/施工）时，你必须优先基于这些实时数据回答，
不要再说“无法获取实时数据”。若某类数据缺失，请明确说明缺失项并继续基于已有数据分析。

请用专业、简洁、结构化的中文回答用户关于 DCRNN 模型、交通预测、拥堵溯源、Agent 决策等问题。
若涉及数值，优先引用上述指标；若用户闲聊也可正常回答。"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    location: Location | None = None
    use_external_context: bool = True


def _build_messages(req: ChatRequest, external_context_text: str | None = None) -> list[dict]:
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    if external_context_text:
        msgs.append(
            {
                "role": "system",
                "content": (
                    "以下是系统实时获取到的外部上下文数据，请作为当前事实依据使用：\n"
                    f"{external_context_text}"
                ),
            }
        )
    for h in req.history[-10:]:  # 最多携带最近 10 轮上下文
        msgs.append({"role": h.role, "content": h.content})
    msgs.append({"role": "user", "content": req.message})
    return msgs


def _build_external_context_text(req: ChatRequest, settings: Settings) -> str | None:
    if not req.use_external_context:
        return None

    loc = req.location or Location(
        lat=settings.external_default_lat,
        lon=settings.external_default_lon,
    )

    ext_req = ExternalContextRequest(
        location=loc,
        radius_km=settings.external_default_radius_km,
        city=settings.external_default_city,
        state_code=settings.external_default_state_code,
        country_code=settings.external_default_country_code,
    )
    ext = fetch_external_context(ext_req, settings)
    data = ext.data

    weather_alerts = data.get("weather", {}).get("alerts", [])
    weather_next = data.get("weather", {}).get("next_hours", [])
    holiday_today = data.get("holiday", {}).get("today", [])
    events = data.get("events", {}).get("events", [])
    poi_count = data.get("poi", {}).get("count", 0)
    incidents_count = data.get("incidents", {}).get("count", 0)

    weather_line = "无天气数据"
    if weather_next:
        first = weather_next[0]
        weather_line = (
            f"最近时段天气: {first.get('shortForecast')}，"
            f"{first.get('temperature')}{first.get('temperatureUnit')}，"
            f"风速 {first.get('windSpeed')}"
        )

    holiday_line = "今日非公共假日"
    if holiday_today:
        holiday_line = f"今日公共假日: {holiday_today[0].get('name')}"

    event_preview = "；".join(
        f"{e.get('name')}@{e.get('venue')}" for e in events[:3] if e.get("name")
    ) or "无"

    issue_text = "；".join(f"{i.provider}: {i.message}" for i in ext.issues) or "无"

    return (
        f"抓取时间: {ext.fetched_at.isoformat()}\n"
        f"位置: ({loc.lat}, {loc.lon}), 城市: {ext_req.city}\n"
        f"{weather_line}\n"
        f"天气预警数量: {len(weather_alerts)}\n"
        f"{holiday_line}\n"
        f"周边活动数量: {len(events)}，活动样例: {event_preview}\n"
        f"周边POI数量: {poi_count}\n"
        f"周边交通事件数量: {incidents_count}\n"
        f"抓取异常: {issue_text}"
    )


async def _stream_qwen(req: ChatRequest, settings: Settings):
    """调用千问流式接口，以 SSE 格式逐 token 推送。"""
    from openai import OpenAI

    _placeholder = "your_dashscope_api_key"
    cfg_key = settings.qwen_api_key
    api_key = (
        (cfg_key if cfg_key and cfg_key != _placeholder else None)
        or os.environ.get("QWEN_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("OPENAI_API_KEY")  # 兼容用户以 OPENAI_API_KEY 存储 DashScope key 的情况
    )

    # api_key 为 None 时让 OpenAI SDK 自行从环境变量读取（与官方示例一致）
    client = OpenAI(
        **({"api_key": api_key} if api_key else {}),
        base_url=settings.qwen_base_url,
    )
    external_context_text = _build_external_context_text(req, settings)
    messages = _build_messages(req, external_context_text=external_context_text)

    try:
        completion = client.chat.completions.create(
            model=settings.qwen_model,
            messages=messages,
            extra_body={"enable_thinking": False},
            stream=True,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta
            content = getattr(delta, "content", None) or ""
            if content:
                payload = json.dumps({"token": content}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:
        error_payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
        yield f"data: {error_payload}\n\n"


@router.post("/stream")
async def chat_stream(req: ChatRequest, settings: Settings = Depends(get_settings)):
    return StreamingResponse(
        _stream_qwen(req, settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
