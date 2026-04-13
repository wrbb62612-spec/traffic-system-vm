"""
多智能体编排接口（v4）。

新增端点：
  GET  /agents/missions             — 列出历史任务（分页）
  GET  /agents/missions/{id}        — 获取任务详情（含完整 result / trace）
  POST /agents/run/stream           — SSE 流式运行（逐节点推送进度 + 最终结果）
  POST /agents/hitl/{id}/decide     — 提交 HITL 审批决策
  DELETE /agents/hitl/{id}/{rid}    — 撤销 HITL 决策
  GET  /agents/hitl/{id}/decisions  — 获取任务的所有 HITL 决策
  POST /agents/hitl/{id}/apply      — 携带 HITL 决策重新运行任务
"""

import asyncio
import json
import threading
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agents.workflow import build_workflow
from app.agents.state import TrafficState
from app.core.config import Settings, get_settings
from app.schemas.external_data import ExternalContextRequest, Location, ProviderName
from app.services.external_data import fetch_external_context
from app.services.agent_event_bus import agent_event_bus
from app.services.llm_client import build_qwen_client
from app.services.mission_store import (
    delete_hitl_decision,
    get_hitl_decisions,
    get_mission,
    get_mission_overview,
    get_mission_request,
    list_missions,
    save_mission,
    upsert_hitl_decision,
)

router = APIRouter(prefix="/agents", tags=["agents"])


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    dataset: str = Field(default="METR-LA")
    scenario: str = Field(default="高峰拥堵协同响应")
    raw_prediction: str
    avg_speed_mph: list[float] = Field(default=[])
    severe_sensor_counts: list[int] = Field(default=[])
    horizons_min: list[int] = Field(default=[5, 15, 30, 60])
    location: Location | None = Field(default=None)
    external_providers: list[ProviderName] = Field(
        default_factory=lambda: ["weather", "holiday", "events", "poi", "incidents"]
    )
    max_revision_rounds: int = Field(default=2, ge=0, le=4)


class AgentRunResponse(BaseModel):
    workflow_state: dict[str, Any]
    llm_enhanced_report: str | None = None


class HitlDecideRequest(BaseModel):
    risk_id: str
    action: str = Field(description="approve | reject | modify")
    reason: str = Field(default="")


# ─── helpers ──────────────────────────────────────────────────────────────────

def _build_init_state(req: AgentRunRequest, settings: Settings) -> TrafficState:
    init: TrafficState = {
        "dataset": req.dataset,
        "scenario": req.scenario,
        "raw_prediction": req.raw_prediction,
        "avg_speed_mph": req.avg_speed_mph,
        "severe_sensor_counts": req.severe_sensor_counts,
        "horizons_min": req.horizons_min,
        "agent_actions": [],
        "coordination_events": [],
        "risk_register": [],
        "revision_round": 0,
        "max_revision_rounds": req.max_revision_rounds,
        "_node_trace": [],
    }
    if req.location:
        ext_req = ExternalContextRequest(
            location=req.location,
            city="Los Angeles",
            state_code="CA",
            country_code=settings.nager_country_code,
            providers=req.external_providers,
        )
        ctx = fetch_external_context(ext_req, settings)
        init["external_context"] = ctx.model_dump()
    return init


async def _optional_llm_polish(result: dict, settings: Settings) -> str | None:
    import os

    _ph = "your_dashscope_api_key"
    cfg_key = settings.qwen_api_key
    api_key = (
        (cfg_key if cfg_key and cfg_key != _ph else None)
        or os.environ.get("QWEN_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    if not api_key:
        return None

    try:
        client = build_qwen_client(settings)
        completion = client.chat.completions.create(
            model=settings.qwen_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是城市交通指挥专家，请对以下 LangGraph 自动生成的管控报告进行专业润色，"
                        "补充具体建议，保持 Markdown 格式，不超过 600 字。"
                    ),
                },
                {"role": "user", "content": result.get("final_report", "")},
            ],
            extra_body={"enable_thinking": False},
        )
        return completion.choices[0].message.content
    except Exception:
        return None


def _persist_mission(result: dict, req: AgentRunRequest, settings: Settings) -> None:
    """后台线程中保存任务，不阻塞 API 响应。"""
    try:
        save_mission(
            settings,
            mission_id=str(result.get("mission_id", "unknown")),
            dataset=req.dataset,
            scenario=req.scenario,
            consensus_score=result.get("consensus_score"),
            revision_round=int(result.get("revision_round", 0)),
            risk_register=list(result.get("risk_register") or []),
            kpi_projection=dict(result.get("kpi_projection") or {}),
            request_data=req.model_dump(mode="json"),
            result_data={
                k: v for k, v in result.items()
                if k not in ("_node_trace",)
            },
            node_trace=result.get("_node_trace"),
        )
    except Exception:
        pass


# ─── WebSocket 事件总线 ───────────────────────────────────────────────────────

@router.websocket("/events/ws")
async def agents_event_stream(websocket: WebSocket):
    await agent_event_bus.connect(websocket)
    await agent_event_bus.broadcast_heartbeat()
    try:
        while True:
            message = await websocket.receive_text()
            if message.lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await agent_event_bus.disconnect(websocket)
    except Exception:
        await agent_event_bus.disconnect(websocket)


# ─── 标准运行 ─────────────────────────────────────────────────────────────────

@router.post("/run", response_model=AgentRunResponse)
async def run_agents(req: AgentRunRequest, settings: Settings = Depends(get_settings)):
    workflow = build_workflow()
    init_state = _build_init_state(req, settings)
    result = workflow.invoke(init_state)

    # 异步广播工作流事件
    mission_id = str(result.get("mission_id", "mission-unknown"))
    asyncio.create_task(
        agent_event_bus.stream_workflow_events(
            mission_id=mission_id,
            dataset=req.dataset,
            scenario=req.scenario,
            events=list(result.get("coordination_events", [])),
            consensus_score=result.get("consensus_score"),
            kpi_projection=result.get("kpi_projection"),
            interval_sec=0.16,
        )
    )

    # 持久化任务（后台）
    threading.Thread(
        target=_persist_mission, args=(dict(result), req, settings), daemon=True
    ).start()

    llm_enhanced = await _optional_llm_polish(dict(result), settings)
    return AgentRunResponse(workflow_state=dict(result), llm_enhanced_report=llm_enhanced)


# ─── SSE 流式运行 ─────────────────────────────────────────────────────────────

@router.post("/run/stream")
async def run_agents_stream(
    req: AgentRunRequest, settings: Settings = Depends(get_settings)
):
    """
    SSE 流式运行多智能体工作流。

    每完成一个 LangGraph 节点即推送一条 `node_complete` 事件；
    全部节点完成后推送 `workflow_result` 事件（含完整 workflow_state）；
    最后推送 `data: [DONE]` 终止符。
    """

    async def event_generator():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        def _callback(event: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        init_state = _build_init_state(req, settings)
        result_holder: dict[str, Any] = {}

        def _worker():
            try:
                wf = build_workflow(event_callback=_callback)
                r = wf.invoke(init_state)
                result_holder["result"] = dict(r)
            except Exception as exc:
                loop.call_soon_threadsafe(
                    queue.put_nowait, {"type": "error", "message": str(exc)}
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        t = threading.Thread(target=_worker, daemon=True)
        t.start()

        try:
            while True:
                item = await asyncio.wait_for(queue.get(), timeout=120.0)
                if item is None:
                    break
                yield f"data: {json.dumps(item, ensure_ascii=False, default=str)}\n\n"
        except asyncio.TimeoutError:
            yield 'data: {"type":"error","message":"workflow timeout"}\n\n'
            return

        t.join(timeout=5)

        result = result_holder.get("result", {})
        if result:
            # 持久化
            threading.Thread(
                target=_persist_mission, args=(result, req, settings), daemon=True
            ).start()
            # 广播 WS 事件
            mission_id = str(result.get("mission_id", "mission-unknown"))
            asyncio.create_task(
                agent_event_bus.stream_workflow_events(
                    mission_id=mission_id,
                    dataset=req.dataset,
                    scenario=req.scenario,
                    events=list(result.get("coordination_events", [])),
                    consensus_score=result.get("consensus_score"),
                    kpi_projection=result.get("kpi_projection"),
                    interval_sec=0.08,
                )
            )
            yield (
                f"data: {json.dumps({'type': 'workflow_result', 'workflow_state': result}, ensure_ascii=False, default=str)}\n\n"
            )

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── 任务历史 ─────────────────────────────────────────────────────────────────

@router.get("/missions")
async def list_missions_api(
    limit: int = 30, settings: Settings = Depends(get_settings)
):
    return {"missions": list_missions(settings, limit=limit)}


@router.get("/missions/{mission_id}")
async def get_mission_api(
    mission_id: str, settings: Settings = Depends(get_settings)
):
    m = get_mission(settings, mission_id)
    if not m:
        raise HTTPException(status_code=404, detail=f"任务 {mission_id} 不存在")
    m["hitl_decisions"] = get_hitl_decisions(settings, mission_id)
    return m


@router.get("/overview")
async def agents_overview(settings: Settings = Depends(get_settings)):
    import os

    overview = get_mission_overview(settings)
    placeholder = "your_dashscope_api_key"
    llm_ready = bool(
        (settings.qwen_api_key and settings.qwen_api_key != placeholder)
        or os.environ.get("QWEN_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    mission_db_ready = Path(settings.mission_db_path).exists()
    rag_db_ready = Path(settings.rag_db_path).exists()

    return {
        "summary": {
            "ws_client_count": agent_event_bus.client_count,
            "llm_ready": llm_ready,
            "mission_db_ready": mission_db_ready,
            "rag_db_ready": rag_db_ready,
            "external_context_enabled": True,
            **overview,
        },
        "capabilities": [
            {
                "id": "workflow_run",
                "label": "标准协同运行",
                "route": "/agents/run",
                "method": "POST",
                "available": True,
                "description": "执行完整 LangGraph 工作流并返回最终结果。",
            },
            {
                "id": "workflow_stream",
                "label": "流式协同运行",
                "route": "/agents/run/stream",
                "method": "POST",
                "available": True,
                "description": "通过 SSE 实时返回节点执行进度和最终工作流结果。",
            },
            {
                "id": "workflow_events",
                "label": "协同事件订阅",
                "route": "/agents/events/ws",
                "method": "WS",
                "available": True,
                "description": "订阅任务开始、协同事件和任务完成广播。",
            },
            {
                "id": "mission_history",
                "label": "任务历史",
                "route": "/agents/missions",
                "method": "GET",
                "available": mission_db_ready,
                "description": "查询历史任务摘要与详情。",
            },
            {
                "id": "hitl",
                "label": "HITL 审批",
                "route": "/agents/hitl/{mission_id}/decide",
                "method": "POST",
                "available": mission_db_ready,
                "description": "对风险项进行 approve/reject/modify 并触发重跑。",
            },
            {
                "id": "chat",
                "label": "智能对话",
                "route": "/chat/stream",
                "method": "POST",
                "available": True,
                "description": "基于场景上下文进行流式问答。",
            },
            {
                "id": "rag",
                "label": "知识检索",
                "route": "/rag/search",
                "method": "POST",
                "available": rag_db_ready,
                "description": "检索本地知识库条目，辅助解释模型与策略。",
            },
        ],
    }


# ─── HITL 审批 ────────────────────────────────────────────────────────────────

@router.post("/hitl/{mission_id}/decide")
async def hitl_decide(
    mission_id: str,
    body: HitlDecideRequest,
    settings: Settings = Depends(get_settings),
):
    if body.action not in ("approve", "reject", "modify"):
        raise HTTPException(status_code=422, detail="action 必须为 approve/reject/modify")
    m = get_mission(settings, mission_id)
    if not m:
        raise HTTPException(status_code=404, detail=f"任务 {mission_id} 不存在")
    upsert_hitl_decision(settings, mission_id, body.risk_id, body.action, body.reason)
    return {
        "ok": True,
        "mission_id": mission_id,
        "risk_id": body.risk_id,
        "action": body.action,
    }


@router.get("/hitl/{mission_id}/decisions")
async def hitl_get_decisions(
    mission_id: str, settings: Settings = Depends(get_settings)
):
    return {"decisions": get_hitl_decisions(settings, mission_id)}


@router.delete("/hitl/{mission_id}/{risk_id}")
async def hitl_delete_decision(
    mission_id: str, risk_id: str, settings: Settings = Depends(get_settings)
):
    ok = delete_hitl_decision(settings, mission_id, risk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="决策不存在")
    return {"ok": True}


@router.post("/hitl/{mission_id}/apply")
async def hitl_apply(
    mission_id: str, settings: Settings = Depends(get_settings)
):
    """
    携带 HITL 决策重新运行原任务，返回更新后的 workflow_state。

    流程：
    1. 加载原始请求参数
    2. 加载已提交的 HITL 决策
    3. 将决策注入 init_state.hitl_decisions
    4. 重新执行工作流（Planner 会将决策转化为契约约束）
    5. 保存新结果，覆盖旧 mission_id 记录
    """
    orig_req_data = get_mission_request(settings, mission_id)
    if not orig_req_data:
        raise HTTPException(status_code=404, detail=f"任务 {mission_id} 不存在或无原始请求")

    decisions = get_hitl_decisions(settings, mission_id)
    if not decisions:
        raise HTTPException(status_code=400, detail="该任务尚无 HITL 决策，请先提交审批")

    try:
        req = AgentRunRequest(**orig_req_data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"原始请求参数不完整: {e}") from e

    init_state = _build_init_state(req, settings)
    # 注入 HITL 决策
    init_state["hitl_decisions"] = decisions
    # 保持 mission_id 不变（覆盖原记录）
    init_state["mission_id"] = mission_id

    workflow = build_workflow()
    result = dict(workflow.invoke(init_state))

    threading.Thread(
        target=_persist_mission, args=(result, req, settings), daemon=True
    ).start()

    return {
        "ok": True,
        "mission_id": mission_id,
        "hitl_applied": len(decisions),
        "consensus_score": result.get("consensus_score"),
        "workflow_state": result,
    }
