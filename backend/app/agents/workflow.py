"""
LangGraph 多智能体协同工作流（v4 Planner-Executor-Critic + HITL + Trace）。

拓扑：
  START -> intake_agent -> planner_agent -> signal_agent -> traffic_agent
        -> transit_agent -> travel_service_agent -> simulation_agent -> critic_agent
        -> (conditional) refine_agent (循环回 signal_agent) | report_agent -> END

v4 新增功能：
- 节点计时（_node_trace）：每个节点执行时记录 start_ms 和 duration_ms
- HITL 决策集成：将外部人类审批结果注入 Planner 契约，影响 Critic 评分
- build_workflow(event_callback)：可选回调，用于 SSE 流式端点逐节点推送进度
- Critic 识别 hitl_approved_risks，避免对人类已批准的风险重复扣分
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from random import random
from typing import Any, Callable
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from app.agents.state import AgentAction, NodeTraceEntry, RiskItem, TrafficState

DEFAULT_MAX_REVISION_ROUNDS = 2


# ─── 节点计时包装器 ────────────────────────────────────────────────────────────

def _timed(
    func: Callable[[TrafficState], TrafficState],
    event_callback: Callable[[dict[str, Any]], None] | None = None,
) -> Callable[[TrafficState], TrafficState]:
    """包装 Agent 函数，执行后记录耗时并追加到 _node_trace，可选触发 SSE 回调。"""

    def wrapper(state: TrafficState) -> TrafficState:
        t0_wall_ms = time.time_ns() / 1_000_000
        t0_perf = time.perf_counter_ns()
        result = func(state)
        duration_ms = round((time.perf_counter_ns() - t0_perf) / 1_000_000, 3)

        trace: list[NodeTraceEntry] = list(state.get("_node_trace") or [])
        entry: NodeTraceEntry = {
            "node": func.__name__,
            "start_ms": round(t0_wall_ms, 3),
            "duration_ms": duration_ms,
            "status": "completed",
        }
        trace.append(entry)
        result["_node_trace"] = trace

        if event_callback is not None:
            try:
                event_callback(
                    {
                        "type": "node_complete",
                        "node": func.__name__,
                        "duration_ms": duration_ms,
                        "start_ms": round(t0_wall_ms, 3),
                        "ts": _now_iso(),
                    }
                )
            except Exception:
                pass

        return result

    wrapper.__name__ = func.__name__
    return wrapper


# ─── HITL 辅助函数 ────────────────────────────────────────────────────────────

def _apply_hitl_to_contract(
    contract: dict[str, Any],
    hitl_decisions: list[dict[str, Any]],
    risk_register: list[dict[str, Any]],
) -> dict[str, Any]:
    """将 HITL 驳回决策转化为协同契约约束（硬性限制），批准的高风险项解锁宽松空间。"""
    rejected_ids = {d["risk_id"] for d in hitl_decisions if d.get("action") == "reject"}
    approved_ids = {d["risk_id"] for d in hitl_decisions if d.get("action") == "approve"}

    for risk in risk_register:
        rid = risk.get("id", "")
        owner = risk.get("owner", "")

        if rid in rejected_ids:
            # 驳回：针对该 owner 强制收紧约束
            if owner == "traffic_control":
                contract["max_ramp_drop_pct"] = max(5, int(contract.get("max_ramp_drop_pct", 12)) - 4)
                note = "HITL 驳回匝道过度限流，已收紧上限。"
                contract.setdefault("hitl_notes", []).append(note)
            elif owner == "signal":
                contract["min_signal_green_ext_pct"] = int(contract.get("min_signal_green_ext_pct", 8)) + 3
                note = "HITL 驳回信控不足，已提升绿信比下限。"
                contract.setdefault("hitl_notes", []).append(note)
            elif owner == "transit":
                contract["min_transit_boost_pct"] = max(10, int(contract.get("min_transit_boost_pct", 6)) + 4)
                note = "HITL 驳回公交承接不足，已提升运力下限。"
                contract.setdefault("hitl_notes", []).append(note)
            elif owner == "planner":
                # KPI 未达成时，降低目标使当前动作能达标
                contract["target_speed_gain_pct"] = max(
                    5, int(contract.get("target_speed_gain_pct", 10)) - 2
                )
                note = "HITL 批准放宽速度提升目标。"
                contract.setdefault("hitl_notes", []).append(note)

        if rid in approved_ids and risk.get("level") in ("high", "critical"):
            # 批准高风险：标记为人类已审核，Critic 不再对其扣分
            contract.setdefault("hitl_approved_risks", []).append(rid)

    return contract


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _append_event(
    state: TrafficState,
    *,
    kind: str,
    source: str,
    summary: str,
    severity: str = "info",
    payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    events = list(state.get("coordination_events", []))
    events.append(
        {
            "id": f"{kind}-{uuid4().hex[:8]}",
            "ts": _now_iso(),
            "kind": kind,
            "source": source,
            "severity": severity,
            "summary": summary,
            "payload": payload or {},
            "loop": int(state.get("revision_round", 0)),
        }
    )
    return events


def _append_action(state: TrafficState, action: AgentAction) -> list[AgentAction]:
    actions = list(state.get("agent_actions", []))
    actions.append(action)
    return actions


def _get_action(actions: list[AgentAction], agent: str) -> AgentAction | None:
    return next((a for a in actions if a.get("agent") == agent), None)


def _pressure_profile(state: TrafficState) -> dict[str, Any]:
    avg_speeds = state.get("avg_speed_mph", [])
    severe = state.get("severe_sensor_counts", [])
    near_speed = float(avg_speeds[0]) if avg_speeds else 45.0
    severe_now = int(severe[0]) if severe else 0

    pressure_index = _clamp((55 - near_speed) * 1.8 + severe_now * 0.38, 0, 100)
    if pressure_index >= 78:
        level = "critical"
    elif pressure_index >= 58:
        level = "high"
    elif pressure_index >= 35:
        level = "medium"
    else:
        level = "low"

    return {
        "near_speed_mph": round(near_speed, 1),
        "severe_sensor_now": severe_now,
        "pressure_index": round(pressure_index, 1),
        "level": level,
    }


def _estimate_baseline_kpi(near_speed: float, severe_now: int) -> dict[str, float]:
    congestion_pct = _clamp(14 + severe_now * 0.58 + max(0, 42 - near_speed) * 0.72, 8, 78)
    delay_min = _clamp(6 + (54 - near_speed) * 0.35 + severe_now * 0.06, 4, 42)
    throughput_idx = _clamp(58 + near_speed * 0.52 - severe_now * 0.08, 38, 96)
    return {
        "avg_speed_mph": round(near_speed, 1),
        "congestion_pct": round(congestion_pct, 1),
        "delay_min": round(delay_min, 1),
        "throughput_index": round(throughput_idx, 1),
    }


def _external_digest(external_context: dict[str, Any] | None) -> str:
    if not external_context:
        return "未接入外部数据"
    data = external_context.get("data", {})
    parts: list[str] = []
    weather_alerts = data.get("weather", {}).get("alerts", [])
    incidents = data.get("incidents", {}).get("count", 0)
    events = data.get("events", {}).get("count", 0)
    holiday_today = data.get("holiday", {}).get("today")
    if weather_alerts:
        parts.append(f"天气预警{len(weather_alerts)}条")
    if incidents:
        parts.append(f"道路事件{incidents}起")
    if events:
        parts.append(f"周边活动{events}场")
    if holiday_today:
        parts.append("节假日出行效应")
    return "、".join(parts) if parts else "外部数据平稳"


def _scenario_objectives(level: str) -> list[str]:
    if level == "critical":
        return [
            "15分钟内抑制主走廊拥堵扩散",
            "优先保障应急与公交走廊通行",
            "控制匝道回溢并降低二次拥堵风险",
        ]
    if level == "high":
        return [
            "30分钟内将拥堵占比拉回预警阈值以下",
            "同步执行信控优化与分流诱导",
            "提高公众出行建议触达率",
        ]
    if level == "medium":
        return [
            "平衡干线与支路通行效率",
            "以低扰动策略降低延误波动",
            "保持公共交通承载稳定",
        ]
    return [
        "维持路网稳定运行",
        "以轻量级干预减少未来峰值风险",
        "持续监测关键瓶颈点",
    ]


def intake_agent(state: TrafficState) -> TrafficState:
    """输入标准化 + 态势评估 + 黑板初始化。"""
    dataset = state.get("dataset", "METR-LA")
    scenario = state.get("scenario", "高峰拥堵协同响应")
    mission_id = state.get("mission_id") or f"mission-{uuid4().hex[:8]}"
    revision_round = int(state.get("revision_round", 0))
    max_rounds = int(state.get("max_revision_rounds", DEFAULT_MAX_REVISION_ROUNDS))
    max_rounds = int(_clamp(max_rounds, 0, 4))

    profile = _pressure_profile(state)
    objectives = _scenario_objectives(profile["level"])
    baseline_kpi = _estimate_baseline_kpi(
        near_speed=profile["near_speed_mph"],
        severe_now=profile["severe_sensor_now"],
    )
    ext_digest = _external_digest(state.get("external_context"))

    brief = (
        f"任务 {mission_id}：{dataset} / {scenario}。"
        f"压力等级={profile['level']}({profile['pressure_index']})，"
        f"近端均速={profile['near_speed_mph']}mph，严重拥堵传感器={profile['severe_sensor_now']}。"
        f"外部上下文：{ext_digest}。"
    )

    blackboard = dict(state.get("shared_blackboard", {}))
    blackboard.update(
        {
            "dataset": dataset,
            "scenario": scenario,
            "pressure_profile": profile,
            "external_digest": ext_digest,
            "baseline_kpi": baseline_kpi,
            "horizons_min": state.get("horizons_min", [5, 15, 30, 60]),
        }
    )

    return {
        "dataset": dataset,
        "scenario": scenario,
        "mission_id": mission_id,
        "revision_round": revision_round,
        "max_revision_rounds": max_rounds,
        "coordination_objectives": objectives,
        "planning_brief": brief,
        "shared_blackboard": blackboard,
        "coordination_events": _append_event(
            state,
            kind="intake",
            source="intake_agent",
            summary=f"完成态势摄取与任务归档（{profile['level']}）",
            severity="success",
            payload={"pressure_profile": profile, "baseline_kpi": baseline_kpi},
        ),
    }


def planner_agent(state: TrafficState) -> TrafficState:
    """Planner：生成协同契约（目标/KPI/约束），并将 HITL 决策注入约束。"""
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    level = profile.get("level", "medium")
    revision_round = int(state.get("revision_round", 0))

    contract: dict[str, Any] = {
        "target_speed_gain_pct": {"critical": 20, "high": 14, "medium": 9, "low": 5}[level],
        "target_congestion_drop_pct": {"critical": 30, "high": 22, "medium": 12, "low": 8}[level],
        "target_delay_drop_pct": {"critical": 24, "high": 16, "medium": 10, "low": 6}[level],
        "max_ramp_drop_pct": {"critical": 20, "high": 15, "medium": 10, "low": 8}[level],
        "min_signal_green_ext_pct": {"critical": 12, "high": 9, "medium": 7, "low": 4}[level],
        "min_transit_boost_pct": {"critical": 12, "high": 8, "medium": 5, "low": 0}[level],
        "hard_constraints": [
            "不允许诱导到应急通道",
            "保证公交优先走廊可用性",
            "避免相邻节点相位冲突导致回溢",
        ],
    }
    if revision_round > 0:
        contract["max_ramp_drop_pct"] = max(8, int(contract["max_ramp_drop_pct"]) - 2)
        contract["min_signal_green_ext_pct"] = int(contract["min_signal_green_ext_pct"]) + 1

    # ── HITL 集成：将已提交的人类审批决策注入契约约束 ──
    hitl_decisions: list[dict[str, Any]] = list(state.get("hitl_decisions") or [])
    risk_register: list[dict[str, Any]] = list(state.get("risk_register") or [])
    if hitl_decisions and risk_register:
        contract = _apply_hitl_to_contract(contract, hitl_decisions, risk_register)
        hitl_summary = f"已应用 {len(hitl_decisions)} 条 HITL 决策到协同契约。"
    else:
        hitl_summary = ""

    brief = state.get("planning_brief", "")
    brief += (
        f"\nPlanner 协同契约：目标提速 {contract['target_speed_gain_pct']}%，"
        f"拥堵下降 {contract['target_congestion_drop_pct']}%，"
        f"延误下降 {contract['target_delay_drop_pct']}%。"
    )
    if hitl_summary:
        brief += f"\n{hitl_summary}"

    summary = "生成协同契约并下发到专业 Agent"
    if hitl_decisions:
        summary += f"（含 {len(hitl_decisions)} 条 HITL 约束）"

    return {
        "planning_brief": brief,
        "coordination_contract": contract,
        "coordination_events": _append_event(
            state,
            kind="plan",
            source="planner_agent",
            summary=summary,
            payload={"contract": contract, "hitl_applied": len(hitl_decisions)},
        ),
    }


def signal_agent(state: TrafficState) -> TrafficState:
    """信控优化 Agent。"""
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    contract = state.get("coordination_contract", {})
    level = profile.get("level", "medium")
    revision_round = int(state.get("revision_round", 0))

    green_ext = {"critical": 18, "high": 12, "medium": 8, "low": 5}[level]
    green_ext = max(green_ext, int(contract.get("min_signal_green_ext_pct", green_ext)))
    if revision_round > 0:
        green_ext += 2

    action: AgentAction = {
        "agent": "signal",
        "title": "动态信号配时重构",
        "detail": f"主走廊绿信比上调 {green_ext}%，关键相位采用滚动窗口联调。",
        "priority": "critical" if level == "critical" else "high",
        "confidence": round(_clamp(0.86 + random() * 0.1, 0.0, 0.99), 2),
        "impact": {
            "speed_gain_pct": round(green_ext * 0.55, 1),
            "congestion_drop_pct": round(green_ext * 0.42, 1),
            "delay_drop_pct": round(green_ext * 0.40, 1),
        },
        "constraints": ["保持行人相位下限", "与匝道计量同步周期对齐"],
        "status": "executing" if revision_round == 0 else "revised",
    }

    actions = _append_action(state, action)
    return {
        "agent_actions": actions,
        "coordination_events": _append_event(
            state,
            kind="execute",
            source="signal_agent",
            summary=f"生成信控动作：绿信比 +{green_ext}%",
            payload={"action": action},
        ),
    }


def traffic_agent(state: TrafficState) -> TrafficState:
    """交通管控 Agent：匝道计量 + VMS 诱导。"""
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    contract = state.get("coordination_contract", {})
    level = profile.get("level", "medium")

    base_ramp_drop = {"critical": 18, "high": 12, "medium": 8, "low": 4}[level]
    max_drop = int(contract.get("max_ramp_drop_pct", base_ramp_drop))
    ramp_drop = min(base_ramp_drop, max_drop)

    vms_library = {
        "critical": "VMS 强制分流到备选走廊，限制进入高饱和瓶颈段",
        "high": "VMS 发布实时绕行建议并提示预计延误",
        "medium": "VMS 提醒拥堵趋势，建议错峰或替代路线",
        "low": "VMS 常规播报，保持轻量诱导",
    }

    action: AgentAction = {
        "agent": "traffic_control",
        "title": "匝道计量与诱导分流",
        "detail": f"匝道流率下调 {ramp_drop}%；{vms_library[level]}。",
        "priority": "high" if level in {"critical", "high"} else "medium",
        "confidence": round(_clamp(0.82 + random() * 0.12, 0.0, 0.99), 2),
        "impact": {
            "speed_gain_pct": round(ramp_drop * 0.30, 1),
            "congestion_drop_pct": round(ramp_drop * 0.56, 1),
            "delay_drop_pct": round(ramp_drop * 0.26, 1),
        },
        "constraints": ["不得造成匝道排队外溢到城市道路", "必须与信控策略同周期评估"],
        "status": "executing",
    }

    actions = _append_action(state, action)
    return {
        "agent_actions": actions,
        "coordination_events": _append_event(
            state,
            kind="execute",
            source="traffic_agent",
            summary=f"生成管控动作：匝道下调 {ramp_drop}%",
            payload={"action": action},
        ),
    }


def transit_agent(state: TrafficState) -> TrafficState:
    """公共交通 Agent：弹性运力调度。"""
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    contract = state.get("coordination_contract", {})
    level = profile.get("level", "medium")

    boost = {"critical": 20, "high": 12, "medium": 7, "low": 0}[level]
    boost = max(boost, int(contract.get("min_transit_boost_pct", 0)))

    action: AgentAction = {
        "agent": "transit",
        "title": "公共交通弹性加班",
        "detail": (
            f"核心走廊运力提升 {boost}%，缩短高峰发班间隔并预留应急接驳能力。"
            if boost > 0
            else "维持常规运力，保留机动班次待命。"
        ),
        "priority": "high" if boost >= 12 else "medium",
        "confidence": round(_clamp(0.8 + random() * 0.12, 0.0, 0.99), 2),
        "impact": {
            "speed_gain_pct": round(boost * 0.18, 1),
            "congestion_drop_pct": round(boost * 0.25, 1),
            "delay_drop_pct": round(boost * 0.20, 1),
            "public_mode_shift_pct": round(boost * 0.52, 1),
        },
        "constraints": ["保障重点枢纽换乘能力", "不降低既有准点率 SLA"],
        "status": "executing",
    }

    actions = _append_action(state, action)
    return {
        "agent_actions": actions,
        "coordination_events": _append_event(
            state,
            kind="execute",
            source="transit_agent",
            summary=f"生成公交动作：运力提升 {boost}%",
            payload={"action": action},
        ),
    }


def travel_service_agent(state: TrafficState) -> TrafficState:
    """出行服务 Agent：用户触达与出行建议分发。"""
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    level = profile.get("level", "medium")
    coverage = {"critical": 92, "high": 84, "medium": 74, "low": 66}[level]
    channels = ["App Push", "车机导航", "路侧信息屏", "公交站电子屏"]

    action: AgentAction = {
        "agent": "travel_service",
        "title": "多端分流建议推送",
        "detail": (
            f"通过 {', '.join(channels[:3])} 发布分流建议，预计触达率 {coverage}%"
            if level in {"critical", "high"}
            else f"通过 {', '.join(channels[:2])} 进行温和诱导，预计触达率 {coverage}%"
        ),
        "priority": "high" if level in {"critical", "high"} else "medium",
        "confidence": round(_clamp(0.78 + random() * 0.15, 0.0, 0.99), 2),
        "impact": {
            "speed_gain_pct": round(coverage * 0.06, 1),
            "congestion_drop_pct": round(coverage * 0.10, 1),
            "delay_drop_pct": round(coverage * 0.07, 1),
            "advice_coverage_pct": float(coverage),
        },
        "constraints": ["避开施工/事故管制路段推荐", "确保建议路由可行且不反复跳变"],
        "status": "executing",
    }

    actions = _append_action(state, action)
    return {
        "agent_actions": actions,
        "coordination_events": _append_event(
            state,
            kind="execute",
            source="travel_service_agent",
            summary=f"生成出行动作：建议触达率 {coverage}%",
            payload={"action": action},
        ),
    }


def simulation_agent(state: TrafficState) -> TrafficState:
    """仿真评估 Agent：聚合动作影响，给出 KPI 投影。"""
    actions = list(state.get("agent_actions", []))
    blackboard = state.get("shared_blackboard", {})
    baseline = dict(blackboard.get("baseline_kpi", {}))
    baseline_speed = float(baseline.get("avg_speed_mph", 42.0))
    baseline_congestion = float(baseline.get("congestion_pct", 26.0))
    baseline_delay = float(baseline.get("delay_min", 14.0))
    baseline_throughput = float(baseline.get("throughput_index", 66.0))

    speed_gain = sum(float(a.get("impact", {}).get("speed_gain_pct", 0)) for a in actions)
    congestion_drop = sum(float(a.get("impact", {}).get("congestion_drop_pct", 0)) for a in actions)
    delay_drop = sum(float(a.get("impact", {}).get("delay_drop_pct", 0)) for a in actions)

    # 多 Agent 协同增益系数（动作越齐全，协同越强）
    synergy = 1.0 + min(0.28, len(actions) * 0.05)
    speed_gain = _clamp(speed_gain * synergy * 0.33, 2, 30)
    congestion_drop = _clamp(congestion_drop * synergy * 0.30, 3, 45)
    delay_drop = _clamp(delay_drop * synergy * 0.28, 2, 38)

    projected_speed = _clamp(baseline_speed * (1 + speed_gain / 100), 15, 88)
    projected_congestion = _clamp(baseline_congestion * (1 - congestion_drop / 100), 4, 82)
    projected_delay = _clamp(baseline_delay * (1 - delay_drop / 100), 2, 60)
    projected_throughput = _clamp(
        baseline_throughput + speed_gain * 0.45 + (baseline_congestion - projected_congestion) * 0.2,
        30,
        99,
    )

    kpi_projection = {
        "before": {
            "avg_speed_mph": round(baseline_speed, 1),
            "congestion_pct": round(baseline_congestion, 1),
            "delay_min": round(baseline_delay, 1),
            "throughput_index": round(baseline_throughput, 1),
        },
        "after": {
            "avg_speed_mph": round(projected_speed, 1),
            "congestion_pct": round(projected_congestion, 1),
            "delay_min": round(projected_delay, 1),
            "throughput_index": round(projected_throughput, 1),
        },
        "speed_gain_pct": round((projected_speed - baseline_speed) / baseline_speed * 100, 1),
        "congestion_drop_pct": round((baseline_congestion - projected_congestion) / baseline_congestion * 100, 1),
        "delay_drop_pct": round((baseline_delay - projected_delay) / baseline_delay * 100, 1),
    }

    return {
        "kpi_projection": kpi_projection,
        "coordination_events": _append_event(
            state,
            kind="simulation",
            source="simulation_agent",
            summary=(
                "仿真评估完成："
                f"提速 {kpi_projection['speed_gain_pct']}%，"
                f"拥堵下降 {kpi_projection['congestion_drop_pct']}%"
            ),
            severity="success",
            payload={"kpi_projection": kpi_projection},
        ),
    }


def critic_agent(state: TrafficState) -> TrafficState:
    """Critic：冲突检测 + 风险登记 + 共识评分。"""
    actions = list(state.get("agent_actions", []))
    contract = dict(state.get("coordination_contract", {}))
    kpi = dict(state.get("kpi_projection", {}))
    profile = state.get("shared_blackboard", {}).get("pressure_profile", {})
    level = profile.get("level", "medium")
    round_idx = int(state.get("revision_round", 0))
    max_rounds = int(state.get("max_revision_rounds", DEFAULT_MAX_REVISION_ROUNDS))

    risks: list[RiskItem] = []
    risk_counter = 1

    def add_risk(level_: str, item: str, mitigation: str, owner: str) -> None:
        nonlocal risk_counter
        risks.append(
            {
                "id": f"R{risk_counter:03d}",
                "level": level_,
                "item": item,
                "mitigation": mitigation,
                "owner": owner,
            }
        )
        risk_counter += 1

    signal = _get_action(actions, "signal")
    traffic = _get_action(actions, "traffic_control")
    transit = _get_action(actions, "transit")
    travel = _get_action(actions, "travel_service")

    signal_ext = float(signal.get("impact", {}).get("speed_gain_pct", 0)) if signal else 0.0
    ramp_drop = 0.0
    if traffic:
        detail = str(traffic.get("detail", ""))
        # 通过 detail 提取粗略计量强度
        digits = [int(ch) for ch in detail if ch.isdigit()]
        ramp_drop = float(digits[0] * 10 + digits[1]) if len(digits) >= 2 else float(contract.get("max_ramp_drop_pct", 10))
    transit_boost = float(transit.get("impact", {}).get("public_mode_shift_pct", 0)) if transit else 0.0
    advice_coverage = float(travel.get("impact", {}).get("advice_coverage_pct", 0)) if travel else 0.0

    if ramp_drop > float(contract.get("max_ramp_drop_pct", 15)):
        add_risk("high", "匝道计量幅度超过协同契约上限", "下调匝道计量并同步强化信控补偿", "traffic_control")

    if ramp_drop >= 12 and signal_ext < 5:
        add_risk("high", "匝道强限流但信控补偿不足，存在回溢风险", "提高主干道绿信比并缩短冲突相位", "signal")

    if level in {"critical", "high"} and transit_boost < 6:
        add_risk("medium", "高压态势下公共交通承接不足", "提升公交加班强度并保障换乘节点", "transit")

    if level in {"critical", "high"} and advice_coverage < 75:
        add_risk("medium", "公众分流触达不足，执行弹性偏弱", "增加车机与路侧屏协同推送", "travel_service")

    speed_gain = float(kpi.get("speed_gain_pct", 0))
    target_speed = float(contract.get("target_speed_gain_pct", 8))
    if speed_gain + 1e-6 < target_speed:
        add_risk(
            "medium",
            f"KPI 提速目标未达成（当前 {speed_gain}% < 目标 {target_speed}%）",
            "触发一轮协同修订，重新平衡信控与管控动作",
            "planner",
        )

    # HITL 批准的高风险项不再扣分（人类已接受风险）
    hitl_approved_risks: set[str] = set(contract.get("hitl_approved_risks", []))

    consensus = 93.0
    for r in risks:
        if r.get("id") in hitl_approved_risks:
            consensus -= 2  # 已批准风险仅轻微扣分
        else:
            consensus -= {"high": 15, "medium": 8, "low": 3}[r["level"]]
    if not risks:
        consensus += 3
    if speed_gain >= target_speed:
        consensus += 2
    if hitl_approved_risks:
        consensus += min(5, len(hitl_approved_risks) * 1.5)  # HITL 参与提升共识
    consensus = round(_clamp(consensus, 50, 99), 1)

    needs_revision = False
    if risks:
        has_high = any(r["level"] == "high" for r in risks)
        medium_count = sum(1 for r in risks if r["level"] == "medium")
        needs_revision = has_high or medium_count >= 2
    if round_idx >= max_rounds:
        needs_revision = False

    critique = (
        "✅ 一致性校验通过：动作契约满足，协同目标可落地。"
        if not risks
        else "⚠️ 发现协同风险："
        + "；".join(f"[{r['level']}] {r['item']}" for r in risks)
    )

    severity = "warn" if needs_revision else ("success" if not risks else "info")
    return {
        "risk_register": risks,
        "consensus_score": consensus,
        "critique": critique,
        "needs_revision": needs_revision,
        "coordination_events": _append_event(
            state,
            kind="critic",
            source="critic_agent",
            summary=(
                f"一致性评分 {consensus}，"
                + ("触发修订回环" if needs_revision else "进入报告汇总")
            ),
            severity=severity,
            payload={"consensus_score": consensus, "risk_count": len(risks)},
        ),
    }


def refine_agent(state: TrafficState) -> TrafficState:
    """回环修订：调整契约后重新执行专业 Agent。"""
    round_idx = int(state.get("revision_round", 0)) + 1
    contract = dict(state.get("coordination_contract", {}))
    critique = state.get("critique", "")

    if "匝道" in critique:
        contract["max_ramp_drop_pct"] = max(8, int(contract.get("max_ramp_drop_pct", 12)) - 3)
    if "信控" in critique:
        contract["min_signal_green_ext_pct"] = int(contract.get("min_signal_green_ext_pct", 8)) + 2
    if "公共交通" in critique:
        contract["min_transit_boost_pct"] = max(10, int(contract.get("min_transit_boost_pct", 6)))
    if "未达成" in critique:
        contract["target_speed_gain_pct"] = max(6, int(contract.get("target_speed_gain_pct", 10)) - 1)

    blackboard = dict(state.get("shared_blackboard", {}))
    blackboard["last_refine_reason"] = critique
    blackboard["last_refine_at"] = _now_iso()

    return {
        "revision_round": round_idx,
        "coordination_contract": contract,
        # 新一轮执行时重算动作集，避免旧动作污染
        "agent_actions": [],
        "shared_blackboard": blackboard,
        "coordination_events": _append_event(
            state,
            kind="refine",
            source="refine_agent",
            summary=f"第 {round_idx} 轮修订完成，重启专业 Agent 协同",
            severity="warn",
            payload={"coordination_contract": contract},
        ),
    }


def _external_context_markdown(external_context: dict[str, Any] | None) -> str:
    if not external_context:
        return "- 未启用外部数据抓取。"

    data = external_context.get("data", {})
    issues = external_context.get("issues", [])
    missing = external_context.get("missing_credentials", {})
    lines: list[str] = []

    weather_alerts = data.get("weather", {}).get("alerts", [])
    lines.append(f"- 天气预警数量: {len(weather_alerts)}")
    lines.append(f"- 交通事件数量: {data.get('incidents', {}).get('count', 0)}")
    lines.append(f"- 周边活动数量: {data.get('events', {}).get('count', 0)}")
    lines.append(f"- 周边POI采样数量: {data.get('poi', {}).get('count', 0)}")
    lines.append(f"- 当日节假日命中: {'是' if data.get('holiday', {}).get('today') else '否'}")

    if missing:
        lines.append("- 缺失凭据: " + ", ".join(f"{k}({v})" for k, v in missing.items()))
    if issues:
        lines.append("- 数据拉取异常: " + "; ".join(f"{i.get('provider')}: {i.get('message')}" for i in issues))

    return "\n".join(lines)


def report_agent(state: TrafficState) -> TrafficState:
    """Reporter：输出结构化协同报告。"""
    dataset = state.get("dataset", "METR-LA")
    scenario = state.get("scenario", "高峰拥堵协同响应")
    mission_id = state.get("mission_id", f"mission-{uuid4().hex[:8]}")
    objectives = state.get("coordination_objectives", [])
    planning_brief = state.get("planning_brief", "")
    contract = state.get("coordination_contract", {})
    actions = state.get("agent_actions", [])
    risks = state.get("risk_register", [])
    kpi = state.get("kpi_projection", {})
    consensus = state.get("consensus_score", 0.0)
    critique = state.get("critique", "")
    rounds = int(state.get("revision_round", 0))
    external_md = _external_context_markdown(state.get("external_context"))
    events = state.get("coordination_events", [])

    before = kpi.get("before", {})
    after = kpi.get("after", {})

    obj_md = "\n".join(f"- {o}" for o in objectives) if objectives else "- 无"
    action_rows = "\n".join(
        f"| {a.get('agent')} | {a.get('title')} | {a.get('detail')} | {a.get('priority')} | {a.get('confidence')} |"
        for a in actions
    ) or "| - | - | - | - | - |"
    risk_rows = "\n".join(
        f"| {r.get('id')} | {r.get('level')} | {r.get('item')} | {r.get('mitigation')} | {r.get('owner')} |"
        for r in risks
    ) or "| - | low | 无显著风险 | 保持监测 | critic |"
    event_rows = "\n".join(
        f"- `{e.get('ts', '')}` [{e.get('source', '')}] {e.get('summary', '')}"
        for e in events[-8:]
    ) or "- 无"

    speed_gain = kpi.get("speed_gain_pct", 0)
    congestion_drop = kpi.get("congestion_drop_pct", 0)
    delay_drop = kpi.get("delay_drop_pct", 0)

    executive_summary = (
        f"任务 {mission_id} 已完成协同闭环。"
        f"预计提速 {speed_gain}%，拥堵下降 {congestion_drop}%，"
        f"一致性评分 {consensus}，修订轮次 {rounds}。"
    )

    report = f"""# 多智能体协同管控报告（v3）

## 任务概览
| 字段 | 内容 |
|---|---|
| Mission ID | {mission_id} |
| 数据集 | {dataset} |
| 场景 | {scenario} |
| 修订轮次 | {rounds} |
| 共识评分 | {consensus} |

## 目标与规划
{obj_md}

### Planner 摘要
{planning_brief}

### 协同契约
| 指标 | 目标 |
|---|---|
| 提速目标 | {contract.get('target_speed_gain_pct', '-')}% |
| 拥堵下降目标 | {contract.get('target_congestion_drop_pct', '-')}% |
| 延误下降目标 | {contract.get('target_delay_drop_pct', '-')}% |
| 匝道计量上限 | {contract.get('max_ramp_drop_pct', '-')}% |

## KPI 投影（仿真评估）
| 指标 | 干预前 | 干预后 | 变化 |
|---|---:|---:|---:|
| 平均速度 (mph) | {before.get('avg_speed_mph', '-')} | {after.get('avg_speed_mph', '-')} | {speed_gain}% |
| 拥堵占比 (%) | {before.get('congestion_pct', '-')} | {after.get('congestion_pct', '-')} | -{congestion_drop}% |
| 平均延误 (min) | {before.get('delay_min', '-')} | {after.get('delay_min', '-')} | -{delay_drop}% |
| 通行效率指数 | {before.get('throughput_index', '-')} | {after.get('throughput_index', '-')} | {round(float(after.get('throughput_index', 0)) - float(before.get('throughput_index', 0)), 1)} |

## Agent 动作清单
| Agent | 动作 | 详情 | 优先级 | 置信度 |
|---|---|---|---|---:|
{action_rows}

## 风险与校验
{critique}

| ID | 级别 | 风险项 | 缓解策略 | 责任方 |
|---|---|---|---|---|
{risk_rows}

## 外部数据证据
{external_md}

## 协同事件回放（最近8条）
{event_rows}

---
{executive_summary}
"""

    return {
        "executive_summary": executive_summary,
        "final_report": report,
        "coordination_events": _append_event(
            state,
            kind="report",
            source="report_agent",
            summary="完成报告汇总并输出执行摘要",
            severity="success",
        ),
    }


def _should_revise(state: TrafficState) -> str:
    needs_revision = bool(state.get("needs_revision"))
    revision_round = int(state.get("revision_round", 0))
    max_rounds = int(state.get("max_revision_rounds", DEFAULT_MAX_REVISION_ROUNDS))
    if needs_revision and revision_round < max_rounds:
        return "refine"
    return "report"


def build_workflow(
    event_callback: Callable[[dict[str, Any]], None] | None = None,
) -> Any:
    """
    构建并编译 LangGraph 工作流。

    Args:
        event_callback: 可选。每个节点执行完毕时同步调用，参数为
            {"type":"node_complete","node":str,"duration_ms":int,"start_ms":int,"ts":str}。
            用于 SSE 流式端点逐节点推送进度（在线程中调用，需 call_soon_threadsafe 包装）。
    """
    def wrap(fn: Callable) -> Callable:
        return _timed(fn, event_callback)

    graph = StateGraph(TrafficState)

    graph.add_node("intake_agent",          wrap(intake_agent))
    graph.add_node("planner_agent",         wrap(planner_agent))
    graph.add_node("signal_agent",          wrap(signal_agent))
    graph.add_node("traffic_agent",         wrap(traffic_agent))
    graph.add_node("transit_agent",         wrap(transit_agent))
    graph.add_node("travel_service_agent",  wrap(travel_service_agent))
    graph.add_node("simulation_agent",      wrap(simulation_agent))
    graph.add_node("critic_agent",          wrap(critic_agent))
    graph.add_node("refine_agent",          wrap(refine_agent))
    graph.add_node("report_agent",          wrap(report_agent))

    graph.add_edge(START, "intake_agent")
    graph.add_edge("intake_agent", "planner_agent")
    graph.add_edge("planner_agent", "signal_agent")
    graph.add_edge("signal_agent", "traffic_agent")
    graph.add_edge("traffic_agent", "transit_agent")
    graph.add_edge("transit_agent", "travel_service_agent")
    graph.add_edge("travel_service_agent", "simulation_agent")
    graph.add_edge("simulation_agent", "critic_agent")

    graph.add_conditional_edges(
        "critic_agent",
        _should_revise,
        {"refine": "refine_agent", "report": "report_agent"},
    )
    graph.add_edge("refine_agent", "signal_agent")
    graph.add_edge("report_agent", END)

    return graph.compile()
