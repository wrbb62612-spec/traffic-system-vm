"""
LangGraph 全局状态定义（多智能体协同 v3）。

采用 Planner-Executor-Critic 的循环架构：
- Planner：解析态势并生成协同契约（目标/KPI/约束）
- Executors：各专业 Agent 产出动作并写入共享黑板
- Critic：冲突检测与一致性评分，必要时触发修订回环
"""

from typing import Any, Literal

from typing_extensions import TypedDict  # noqa: UP035 – keep for py 3.10 compat


class CoordinationEvent(TypedDict, total=False):
    id: str
    ts: str
    kind: str
    source: str
    severity: Literal["info", "success", "warn", "error"]
    summary: str
    payload: dict[str, Any]
    loop: int


class AgentAction(TypedDict, total=False):
    agent: str
    title: str
    detail: str
    priority: Literal["critical", "high", "medium", "low"]
    confidence: float
    impact: dict[str, float]
    constraints: list[str]
    status: Literal["planned", "executing", "revised", "accepted", "rejected"]


class RiskItem(TypedDict, total=False):
    id: str
    level: Literal["high", "medium", "low"]
    item: str
    mitigation: str
    owner: str


class NodeTraceEntry(TypedDict, total=False):
    """单个 LangGraph 节点的执行时间记录。"""
    node: str
    start_ms: float     # epoch milliseconds, supports sub-ms precision
    duration_ms: float
    status: str         # completed | error


class HitlDecisionEntry(TypedDict, total=False):
    """已提交的 HITL 审批决策（从 DB 加载后注入 State）。"""
    risk_id: str
    action: str          # approve | reject | modify
    reason: str
    decided_at: str


class TrafficState(TypedDict, total=False):
    # 输入数据层
    dataset: str
    scenario: str
    mission_id: str
    raw_prediction: str
    avg_speed_mph: list[float]
    severe_sensor_counts: list[int]
    horizons_min: list[int]
    external_context: dict[str, Any]

    # 编排层（Planner）
    coordination_objectives: list[str]
    planning_brief: str
    coordination_contract: dict[str, Any]
    shared_blackboard: dict[str, Any]

    # 执行层（Executors）
    agent_actions: list[AgentAction]
    coordination_events: list[CoordinationEvent]

    # 评估层（Critic）
    risk_register: list[RiskItem]
    kpi_projection: dict[str, Any]
    critique: str
    consensus_score: float
    needs_revision: bool
    revision_round: int
    max_revision_rounds: int

    # 输出层
    executive_summary: str
    final_report: str

    # ── 新增：可观测性 & HITL ──────────────────────────────────────────────
    _node_trace: list[NodeTraceEntry]        # 各节点执行时间线
    hitl_decisions: list[HitlDecisionEntry]  # 本次运行携带的 HITL 决策
