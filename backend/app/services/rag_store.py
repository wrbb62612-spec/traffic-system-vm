"""
交通领域知识库（RAG Store）。

使用 SQLite FTS5 全文检索实现轻量级 RAG：
- 预置交通系统领域知识（DCRNN / LangGraph / 信控 / 拥堵 / HITL 等）
- 支持关键词 + BM25 排序检索
- 对外提供 search_knowledge / list_knowledge 接口
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

# ─── 知识库种子数据 ───────────────────────────────────────────────────────────

KNOWLEDGE_SEEDS: list[dict[str, str]] = [
    {
        "id": "rag-dcrnn-arch",
        "title": "DCRNN 模型架构",
        "category": "预测模型",
        "tags": "DCRNN,扩散卷积,GRU,交通预测,图神经网络",
        "content": (
            "DCRNN（Diffusion Convolutional Recurrent Neural Network）是 ICLR 2018 提出的交通预测模型。\n"
            "核心创新：将扩散过程引入图卷积，通过双向随机游走同时捕获上下游交通流的空间依赖。\n"
            "时间依赖：Encoder-Decoder 框架基于 GRU，Encoder 编码历史时序，Decoder 预测未来步长。\n"
            "输入：过去 12 步（1 小时）速度，每步 5 分钟；输出：未来 12 步（5/15/30/60 分钟）速度。\n"
            "METR-LA 性能：MAE 2.18/2.67/3.08/3.56，MAPE 5.17%/6.84%/8.38%/10.30%（5/15/30/60min）。\n"
            "PEMS-BAY 性能：MAE 0.85/1.31/1.66/1.98，MAPE 1.63%/2.74%/3.76%/4.74%（5/15/30/60min）。\n"
            "局限性：依赖固定图结构，对突发事件响应较慢；适合短期（≤1h）速度趋势预测。"
        ),
    },
    {
        "id": "rag-langgraph-arch",
        "title": "LangGraph 多智能体架构",
        "category": "Agent 框架",
        "tags": "LangGraph,状态机,StateGraph,Checkpointer,条件边,循环",
        "content": (
            "LangGraph 将 Agent 工作流抽象为有向状态机（Directed State Machine）。\n"
            "核心概念：\n"
            "- StateGraph：有向图，节点是处理函数，边是数据流向。\n"
            "- TypedDict State：图的全局共享状态，每个节点读取并更新。\n"
            "- Conditional Edges：根据状态值动态路由，实现 if/else 分支与循环。\n"
            "- Checkpointer：状态快照持久化，支持跨请求会话保持和从中断点恢复（Time Travel）。\n"
            "本系统工作流：START→intake→planner→signal→traffic→transit→travel→simulation→critic→"
            "（条件）→refine（循环回 signal）或 report→END。\n"
            "Critic 触发修订条件：存在高风险项，或中风险项≥2，且未超过 max_revision_rounds。"
        ),
    },
    {
        "id": "rag-hitl-pattern",
        "title": "Human-in-the-Loop（HITL）设计模式",
        "category": "Agent 技术",
        "tags": "HITL,人类在环,审批,中断,风险控制,interrupt_before",
        "content": (
            "HITL（Human-in-the-Loop）是在高风险自动化决策中引入人类监督的设计模式。\n"
            "LangGraph 实现方式：在 critic 节点设置 interrupt_before，工作流在此暂停等待人类决策。\n"
            "本系统 HITL 流程：\n"
            "1. Critic Agent 识别协同风险，生成风险登记册（risk_register）。\n"
            "2. 前端展示风险卡片，人工选择批准/驳回/标注修改。\n"
            "3. 后端存储 HITL 决策至 SQLite（hitl_decisions 表）。\n"
            "4. 对驳回的动作，系统强制触发修订回环（refine_agent），重新优化协同契约。\n"
            "对批准的高风险动作，Planner 将其纳入协同契约约束，防止 Critic 再次标记。\n"
            "关键原则：高风险操作（critical/high）必须通过 HITL 验证，低风险可自动执行。"
        ),
    },
    {
        "id": "rag-signal-control",
        "title": "交通信号控制优化策略",
        "category": "交通管理",
        "tags": "信号控制,绿信比,相位,自适应信号,联动协调,SCOOT,SCATS",
        "content": (
            "交通信号优化目标：最大化通行能力、最小化延误和停车次数。\n"
            "关键参数：\n"
            "- 绿信比（Green Split）：绿灯时间占周期比例，直接影响通行能力。\n"
            "- 周期长（Cycle Length）：通常 60-120 秒，高峰期适当延长。\n"
            "- 相位差（Offset）：相邻路口绿灯开始时刻之差，用于绿波协调。\n"
            "本系统 Signal Agent 策略：压力等级 critical 时绿信比上调 18%；high 上调 12%；"
            "medium 上调 8%；同时实现主走廊绿波联动，减少车辆停车等待。\n"
            "约束：保证行人相位下限（通常≥7秒）；与匝道计量同步评估周期，防止回溢。\n"
            "典型效果：绿信比提升 10% 可使主干道通行能力提升约 5.5%，延误下降约 4%。"
        ),
    },
    {
        "id": "rag-ramp-metering",
        "title": "匝道计量（Ramp Metering）理论与实践",
        "category": "交通管理",
        "tags": "匝道计量,入口控制,主线保护,ALINEA,回溢,瓶颈",
        "content": (
            "匝道计量通过控制入口匝道进入主线的流量来保护主线不超过容量。\n"
            "核心算法 ALINEA：基于主线检测器密度，反馈控制计量率。\n"
            "本系统 Traffic Agent 策略：\n"
            "- critical 压力：匝道流率最多下调 18%。\n"
            "- high 压力：下调 12%。\n"
            "- 始终遵守协同契约中 max_ramp_drop_pct 上限约束。\n"
            "关键风险：过度限流导致匝道排队外溢到城市道路，形成二次拥堵。\n"
            "缓解策略：将计量强度与信控绿信比联动调整；设置匝道排队长度预警阈值。\n"
            "效果评估：合理计量可使主线速度提升 3-9%，拥堵传播范围缩小 15-25%。"
        ),
    },
    {
        "id": "rag-congestion-wave",
        "title": "交通拥堵波动理论（激波分析）",
        "category": "交通理论",
        "tags": "激波,拥堵波,LWR,交通流,瓶颈,传播速度",
        "content": (
            "拥堵激波（Shockwave）：当上游流量超过下游容量时，形成向上游传播的拥堵波。\n"
            "LWR 模型（Lighthill-Whitham-Richards）：将交通流视为连续流体，使用守恒方程描述。\n"
            "激波速度 = (q₂-q₁)/(k₂-k₁)，负值表示拥堵向上游传播。\n"
            "DCRNN 预测输出与激波的关系：当速度预测呈连续下降趋势时，意味着拥堵激波正在形成。\n"
            "severe_sensor_counts 上升代表高密度区域扩大，对应拥堵激波传播范围增大。\n"
            "干预时机：应在激波形成前（severe_sensor_count 快速上升阶段）介入，效果最优。\n"
            "本系统 pressure_index 计算：(55 - near_speed) × 1.8 + severe_now × 0.38，"
            "≥78 为 critical，≥58 为 high，≥35 为 medium。"
        ),
    },
    {
        "id": "rag-transit-responsive",
        "title": "公共交通响应式调度策略",
        "category": "交通管理",
        "tags": "公交,运力调度,弹性运营,换乘,模式转移,客流预测",
        "content": (
            "公共交通响应式调度：在突发拥堵或大客流事件时弹性调整运力。\n"
            "本系统 Transit Agent 策略：\n"
            "- critical 压力：核心走廊运力提升 20%，缩短高峰发班间隔。\n"
            "- high 压力：运力提升 12%，启动备用班次。\n"
            "- 约束：保障重点枢纽换乘能力；不降低准点率 SLA（≥85%）。\n"
            "公众模式转移效果：公交运力提升 20% 可诱导约 10.4% 的私家车用户转为公共交通。\n"
            "这一模式转移效果可降低路网整体需求约 3-5%，间接改善主线速度。\n"
            "与 Travel Service Agent 协同：公交调度信息通过多端推送告知用户，提高转移响应率。"
        ),
    },
    {
        "id": "rag-consensus-scoring",
        "title": "多智能体协同共识评分方法",
        "category": "Agent 技术",
        "tags": "共识评分,Critic,冲突检测,一致性,风险,协同契约",
        "content": (
            "共识评分（Consensus Score）由 Critic Agent 计算，范围 50-99.6 分。\n"
            "初始基准分：93 分。\n"
            "扣分规则：\n"
            "- 高风险项（high）：每项 -15 分。\n"
            "- 中风险项（medium）：每项 -8 分。\n"
            "- 低风险项（low）：每项 -3 分。\n"
            "加分规则：\n"
            "- 无风险项：+3 分。\n"
            "- KPI 提速目标达成：+2 分。\n"
            "触发修订条件：存在高风险项，或中风险项≥2，且当前轮次<max_revision_rounds。\n"
            "共识评分 > 85 时进入报告汇总阶段；≤85 时若还有修订机会则强制回环。\n"
            "评分意义：反映多智能体协同方案的内部一致性与安全边际。"
        ),
    },
    {
        "id": "rag-rag-pattern",
        "title": "检索增强生成（RAG）在交通系统中的应用",
        "category": "Agent 技术",
        "tags": "RAG,向量检索,知识库,上下文增强,LlamaIndex,混合检索",
        "content": (
            "RAG（Retrieval-Augmented Generation）通过检索私有知识库来增强 LLM 输出的准确性。\n"
            "本系统应用场景：\n"
            "1. 聊天助手：检索交通管理规范和历史案例，回答专业问题时引用领域知识。\n"
            "2. Planner Agent：参考历史拥堵案例生成更合理的协同契约。\n"
            "3. 报告生成：引用领域基准数据（如 DCRNN 性能指标）提升报告可信度。\n"
            "检索策略：本系统使用 SQLite FTS5 BM25 关键词检索（生产环境建议替换为 Milvus/Qdrant）。\n"
            "自适应 RAG：先由路由节点判断用户问题是需要检索知识库还是直接调用业务 API，"
            "对于实时数据类问题路由到 /predict 和 /external 接口，"
            "对于原理类问题路由到知识库检索。"
        ),
    },
    {
        "id": "rag-kpi-metrics",
        "title": "交通 KPI 指标体系",
        "category": "评估指标",
        "tags": "KPI,MAE,MAPE,通行效率,延误,拥堵率,速度,吞吐量",
        "content": (
            "本系统使用四类核心 KPI 评估多智能体干预效果：\n"
            "1. 平均速度（avg_speed_mph）：全路网传感器平均速度，mph。干预前后对比。\n"
            "2. 拥堵占比（congestion_pct）：速度低于拥堵阈值的传感器比例，%。目标：下降 20%+。\n"
            "3. 平均延误（delay_min）：相对自由流速度的额外时间损失，分钟。\n"
            "4. 通行效率指数（throughput_index）：综合流量与速度的无量纲效率指标，目标：>65。\n"
            "仿真评估方法：各 Agent 动作 impact 字段包含对 KPI 的预计影响；\n"
            "Simulation Agent 通过协同增益系数（synergy factor：1.0+min(0.28, n_actions×0.05)）\n"
            "放大多 Agent 协同的叠加效果，并输出干预前后的 KPI 投影。\n"
            "模型误差参考：METR-LA 60min 预测 MAPE 10.3%，需在置信区间内解读 KPI 投影。"
        ),
    },
    {
        "id": "rag-data-sources",
        "title": "PEMS 数据集与传感器说明",
        "category": "数据",
        "tags": "PEMS,METR-LA,PEMS-BAY,传感器,检测器,环形线圈,速度",
        "content": (
            "本系统使用两个标准交通数据集：\n"
            "METR-LA：洛杉矶大都市区高速公路，207 个传感器，速度（mph），2012年3-6月。\n"
            "PEMS-BAY：旧金山湾区高速公路，325 个传感器，速度（mph），2017年1-5月。\n"
            "数据来源：加州 Caltrans PeMS（Performance Measurement System）。\n"
            "传感器类型：道路嵌入式环形线圈检测器，每5分钟聚合一次流量/速度/占有率数据。\n"
            "图结构：以传感器为节点，道路连接为边，边权重基于传感器间的道路距离。\n"
            "DCRNN 使用高斯核函数计算边权重：w_ij = exp(-d_ij²/σ²)，σ 通过标准差归一化。\n"
            "severe_sensor_count 定义：速度低于 35 mph（洛杉矶）或 40 mph（湾区）的传感器数量。"
        ),
    },
    {
        "id": "rag-external-context",
        "title": "外部上下文数据采集",
        "category": "数据",
        "tags": "外部数据,天气,节假日,活动,POI,事故,NWS,Nager,Overpass",
        "content": (
            "本系统集成五类外部上下文数据源，增强拥堵成因解释能力：\n"
            "1. 天气（NWS API）：获取路网区域天气预报和预警，雨雪天气降低摩擦系数，增加事故率。\n"
            "2. 节假日（Nager.Date API）：节假日出行需求激增 20-40%，需提前准备运力。\n"
            "3. 活动事件（OpenStreetMap/Overpass）：大型活动散场叠加高峰是最难处理的拥堵场景。\n"
            "4. POI 密度（Overpass API）：高 POI 密度区域有更强的吸引/发生交通需求。\n"
            "5. 事故/施工（Overpass）：事故点速度骤降，形成上游拥堵激波核心。\n"
            "外部数据采集频率：天气/事故 300 秒，活动 1800 秒，POI 6 小时，节假日每日。\n"
            "外部数据通过 Chat 接口注入：调用 /chat/stream 时自动附加当前位置的外部上下文。"
        ),
    },
]


# ─── init & seed ─────────────────────────────────────────────────────────────

_CREATE_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge
USING fts5(
    id UNINDEXED,
    title,
    category UNINDEXED,
    tags,
    content,
    tokenize = "unicode61 tokenchars '-'"
);
"""


def init_rag_db(settings) -> None:
    path = Path(settings.rag_db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(path)) as conn:
        conn.executescript(_CREATE_SQL)
        # 检查是否已有数据
        count = conn.execute("SELECT count(*) FROM knowledge").fetchone()[0]
        if count == 0:
            _seed(conn)
        conn.commit()


def _seed(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT INTO knowledge (id, title, category, tags, content) VALUES (?,?,?,?,?)",
        [(k["id"], k["title"], k["category"], k["tags"], k["content"]) for k in KNOWLEDGE_SEEDS],
    )


# ─── search & list ────────────────────────────────────────────────────────────

def search_knowledge(settings, query: str, limit: int = 5) -> list[dict[str, Any]]:
    """BM25 全文检索，返回最相关的知识条目。"""
    if not query or not query.strip():
        return list_knowledge(settings, limit=limit)
    with sqlite3.connect(str(settings.rag_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, title, category, tags,
                   snippet(knowledge, 4, '<em>', '</em>', '...', 24) AS snippet,
                   bm25(knowledge) AS score
            FROM knowledge
            WHERE knowledge MATCH ?
            ORDER BY score
            LIMIT ?
            """,
            (query, limit),
        ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["score"] = round(abs(d.get("score", 0)), 3)
        results.append(d)
    return results


def list_knowledge(settings, limit: int = 20) -> list[dict[str, Any]]:
    with sqlite3.connect(str(settings.rag_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, title, category, tags FROM knowledge LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_knowledge_item(settings, item_id: str) -> dict[str, Any] | None:
    with sqlite3.connect(str(settings.rag_db_path)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM knowledge WHERE id = ?", (item_id,)
        ).fetchone()
    return dict(row) if row else None
