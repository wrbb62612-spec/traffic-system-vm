import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import MarkdownContent from '../../components/MarkdownContent';

const BACKEND_URL = 'http://localhost:8000';

// ============================================================
// STATUS META
// ============================================================
const STATUS_META = {
  running:    { label: '运行中', color: '#39ff6a', bg: 'rgba(57,255,106,0.10)',  border: 'rgba(57,255,106,0.35)' },
  processing: { label: '处理中', color: '#ff9500', bg: 'rgba(255,149,0,0.12)',   border: 'rgba(255,149,0,0.35)' },
  standby:    { label: '待命',   color: '#00c3ff', bg: 'rgba(0,195,255,0.09)',   border: 'rgba(0,195,255,0.30)' },
  completed:  { label: '完成',   color: '#7ab8d8', bg: 'rgba(122,184,216,0.10)', border: 'rgba(122,184,216,0.28)' },
  error:      { label: '异常',   color: '#ff3b3b', bg: 'rgba(255,59,59,0.10)',   border: 'rgba(255,59,59,0.38)' },
};

// ============================================================
// STAGE TEMPLATES
// ============================================================
const STAGE_TEMPLATES = [
  { id: 'intake',   name: '感知摄取', nameEn: 'Intake',     hint: '汇聚 DCRNN 预测与外部态势',       owners: ['perception','predictor','orchestrator'], color: '#00c3ff' },
  { id: 'plan',     name: '策略规划', nameEn: 'Planner',    hint: '构建协同契约与行动约束',           owners: ['orchestrator','predictor'],              color: '#39ff6a' },
  { id: 'execute',  name: '并行执行', nameEn: 'Executors',  hint: '各专业 Agent 并行产出动作',        owners: ['signal','traffic','transit','travel'],   color: '#ff9500' },
  { id: 'simulate', name: '仿真推演', nameEn: 'Simulation', hint: '评估 KPI 改善与副作用',            owners: ['evaluator','predictor'],                 color: '#00ffc8' },
  { id: 'critic',   name: '一致性校验',nameEn: 'Critic',   hint: '冲突检测、风险登记、共识评分',      owners: ['evaluator','orchestrator'],              color: '#ffd700' },
  { id: 'refine',   name: '回环修订', nameEn: 'Refine',     hint: '针对风险修订后再执行',             owners: ['orchestrator','signal','traffic'],        color: '#ff6b9d' },
];

// ============================================================
// AGENT TEMPLATES
// ============================================================
const AGENT_TEMPLATES = [
  { id: 'orchestrator', name: '全局编排 Agent', nameEn: 'Orchestrator',   icon: '🧠', color: '#00c3ff', role: '任务拆解、约束下发、策略统筹' },
  { id: 'perception',   name: '态势感知 Agent', nameEn: 'Perception',     icon: '📡', color: '#7ab8d8', role: '多源数据融合与异常提取' },
  { id: 'predictor',    name: '预测分析 Agent', nameEn: 'Predictor',      icon: '📈', color: '#39ff6a', role: 'DCRNN 预测解析与趋势预判' },
  { id: 'signal',       name: '信控优化 Agent', nameEn: 'Signal',         icon: '🚦', color: '#ff9500', role: '动态相位与绿信比优化' },
  { id: 'traffic',      name: '交通管控 Agent', nameEn: 'Traffic Control', icon: '🚔', color: '#ff6b6b', role: '匝道计量、诱导分流、路段管控' },
  { id: 'transit',      name: '公交协同 Agent', nameEn: 'Transit',        icon: '🚌', color: '#b24bff', role: '公共交通运力弹性调度' },
  { id: 'travel',       name: '出行服务 Agent', nameEn: 'Travel Service', icon: '🧭', color: '#ffd700', role: '多终端分流建议触达' },
  { id: 'evaluator',    name: '评估审查 Agent', nameEn: 'Evaluator',      icon: '🧪', color: '#00ffc8', role: '仿真评估、一致性审查、风险登记' },
];

const TOPOLOGY_LINKS = [
  { source: 'perception',   target: 'orchestrator', weight: 8 },
  { source: 'predictor',    target: 'orchestrator', weight: 9 },
  { source: 'orchestrator', target: 'signal',       weight: 10 },
  { source: 'orchestrator', target: 'traffic',      weight: 9 },
  { source: 'orchestrator', target: 'transit',      weight: 7 },
  { source: 'orchestrator', target: 'travel',       weight: 8 },
  { source: 'signal',       target: 'traffic',      weight: 7 },
  { source: 'traffic',      target: 'travel',       weight: 7 },
  { source: 'transit',      target: 'travel',       weight: 6 },
  { source: 'signal',       target: 'evaluator',    weight: 8 },
  { source: 'traffic',      target: 'evaluator',    weight: 8 },
  { source: 'transit',      target: 'evaluator',    weight: 7 },
  { source: 'travel',       target: 'evaluator',    weight: 7 },
  { source: 'evaluator',    target: 'orchestrator', weight: 9 },
];

// ============================================================
// LANGGRAPH WORKFLOW DAG DEFINITION
// ============================================================
const LG_NODES = [
  { id: 'start',          label: 'START',      type: 'terminal', color: '#00ffc8', stageId: null },
  { id: 'intake_agent',   label: '感知摄取',   icon: '📡',       color: '#7ab8d8', stageId: 'intake' },
  { id: 'planner_agent',  label: '策略规划',   icon: '🧠',       color: '#00c3ff', stageId: 'plan' },
  { id: 'signal_agent',   label: '信控优化',   icon: '🚦',       color: '#ff9500', stageId: 'execute' },
  { id: 'traffic_agent',  label: '交通管控',   icon: '🚔',       color: '#ff6b6b', stageId: 'execute' },
  { id: 'transit_agent',  label: '公交协同',   icon: '🚌',       color: '#b24bff', stageId: 'execute' },
  { id: 'travel_agent',   label: '出行服务',   icon: '🧭',       color: '#ffd700', stageId: 'execute' },
  { id: 'simulation_agent',label: '仿真推演',  icon: '⚗️',       color: '#00ffc8', stageId: 'simulate' },
  { id: 'critic_agent',   label: '一致性校验', icon: '🧪',       color: '#ffd700', stageId: 'critic' },
  { id: 'refine_agent',   label: '修订回环',   icon: '🔄',       color: '#ff6b9d', stageId: 'refine', branch: 'left' },
  { id: 'report_agent',   label: '报告汇总',   icon: '📋',       color: '#39ff6a', stageId: null, branch: 'right' },
  { id: 'end',            label: 'END',        type: 'terminal', color: '#00ffc8', stageId: null },
];

// ============================================================
// SCENARIOS
// ============================================================
const SCENARIOS = [
  {
    id: 'la_peak', title: '洛杉矶早高峰主走廊拥堵', dataset: 'METR-LA',
    prediction: 'I-405 与 I-10 走廊在未来 15-30 分钟出现拥堵扩散迹象，平均速度预计持续下探，存在匝道回溢风险。',
    avgSpeed: [29.8, 27.4, 25.6, 24.2], severe: [36, 48, 56, 60], horizons: [5, 15, 30, 60],
    baselineCongestion: 33.8, baselineDelay: 17.1, baselineThroughput: 63.4,
    location: { lat: 34.0522, lon: -118.2437 },
  },
  {
    id: 'bay_event', title: '湾区大型活动散场冲击', dataset: 'PEMS-BAY',
    prediction: '湾区活动散场叠加晚高峰，桥梁入口与外围快速路负荷同时上升，短时拥堵波峰出现并向支路扩散。',
    avgSpeed: [34.2, 31.1, 29.0, 27.8], severe: [24, 30, 38, 44], horizons: [5, 15, 30, 60],
    baselineCongestion: 28.7, baselineDelay: 14.9, baselineThroughput: 68.1,
    location: { lat: 37.7749, lon: -122.4194 },
  },
  {
    id: 'rain_incident', title: '雨天事故叠加连锁拥堵', dataset: 'METR-LA',
    prediction: '雨天造成制动距离增大，事故点附近速度快速下降，多个瓶颈节点形成串联拥堵，链路恢复时间拉长。',
    avgSpeed: [26.5, 24.8, 23.9, 22.7], severe: [42, 54, 62, 68], horizons: [5, 15, 30, 60],
    baselineCongestion: 38.2, baselineDelay: 19.8, baselineThroughput: 58.6,
    location: { lat: 34.0395, lon: -118.2677 },
  },
  {
    id: 'holiday_return', title: '节假日返程潮冲击', dataset: 'PEMS-BAY',
    prediction: '返程潮导致跨城走廊需求激增，预计多个入口段在 30 分钟内接近饱和，需提前分流与公交承接。',
    avgSpeed: [31.4, 29.6, 27.7, 26.8], severe: [28, 36, 45, 52], horizons: [5, 15, 30, 60],
    baselineCongestion: 31.1, baselineDelay: 16.3, baselineThroughput: 65.2,
    location: { lat: 37.8044, lon: -122.2712 },
  },
];

const SPEED_OPTIONS = [
  { id: 'fast', label: '快', tickMs: 1200 },
  { id: 'normal', label: '中', tickMs: 1800 },
  { id: 'slow', label: '慢', tickMs: 2600 },
];

const INNER_TABS = [
  { id: 0, label: '协同编排', icon: '⬡', desc: 'Coordination' },
  { id: 1, label: '执行轨迹', icon: '⏱', desc: 'Trace' },
  { id: 2, label: 'HITL 审批', icon: '🔐', desc: 'Human-in-Loop' },
  { id: 3, label: '智能对话', icon: '💬', desc: 'AI Chat' },
];

const CHAT_SUGGESTIONS = [
  '当前场景下信控优化的策略是什么？',
  '解释 DCRNN 模型的预测原理',
  '匝道计量会带来哪些风险？',
  '如何评估多智能体协同效果？',
  '当前共识评分代表什么含义？',
];

// ============================================================
// UTILITIES
// ============================================================
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function uid(p) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`; }
function getScenarioById(id) { return SCENARIOS.find(s => s.id === id) || SCENARIOS[0]; }

function stageStateFromIndex(stageIndex, progress = 8) {
  return STAGE_TEMPLATES.map((s, i) => {
    if (i < stageIndex) return { ...s, progress: 100, status: 'completed' };
    if (i === stageIndex) return { ...s, progress, status: 'running' };
    return { ...s, progress: 0, status: 'pending' };
  });
}

function buildIdleStages() {
  return STAGE_TEMPLATES.map(stage => ({ ...stage, progress: 0, status: 'pending' }));
}

function taskTemplate(agentId, stageId, scenario) {
  const title = scenario.title;
  const map = {
    intake:   { orchestrator: `汇总 ${title} 的实时态势并确认优先级`, perception: '融合传感器流、事件流、天气与活动上下文', predictor: `解析 ${scenario.dataset} 预测结果并提取风险窗口`, signal: '等待编排指令', traffic: '等待编排指令', transit: '等待编排指令', travel: '等待编排指令', evaluator: '准备评估基线指标' },
    plan:     { orchestrator: '生成协同契约（目标/KPI/约束）', perception: '提供瓶颈链路权重与传播方向', predictor: '输出关键时域风险阈值', signal: '预生成多套信号配时策略', traffic: '预生成匝道计量与诱导策略', transit: '预生成弹性运力调度预案', travel: '预生成多端触达策略', evaluator: '定义评估指标与冲突规则' },
    execute:  { orchestrator: '分发执行令并监控并行进度', perception: '持续回流现场反馈数据', predictor: '动态修正短时预测偏差', signal: '执行动态相位与绿信比调整', traffic: '执行匝道计量与分流诱导', transit: '执行公交运力弹性加班', travel: '执行分流建议全渠道触达', evaluator: '采集动作执行质量' },
    simulate: { orchestrator: '核对执行覆盖率与时效性', perception: '输出实时回路稳定性数据', predictor: '估计下一窗口拥堵传播概率', signal: '提交路口效能变化数据', traffic: '提交路段压力变化数据', transit: '提交客流转移数据', travel: '提交触达与采纳数据', evaluator: '运行协同仿真并输出 KPI 投影' },
    critic:   { orchestrator: '主持冲突审查与责任归因', perception: '复核异常来源可信度', predictor: '复核预测-执行一致性', signal: '回应信控冲突项', traffic: '回应管控冲突项', transit: '回应公共交通承接风险', travel: '回应触达不足风险', evaluator: '输出一致性评分与风险登记' },
    refine:   { orchestrator: '按审查意见修订协同契约', perception: '校验修订后数据闭环', predictor: '提供修订后的阈值边界', signal: '应用修订后信控参数', traffic: '应用修订后匝道策略', transit: '应用修订后运力策略', travel: '应用修订后触达策略', evaluator: '复检修订后一致性' },
  };
  return map[stageId]?.[agentId] || '等待任务分配';
}

function buildInitialAgents(scenario) {
  return AGENT_TEMPLATES.map((a, i) => ({
    ...a, status: i < 3 ? 'running' : 'standby',
    cpu: Math.round(28 + Math.random() * 28), memory: Math.round(35 + Math.random() * 28),
    queue: Math.round(20 + Math.random() * 26), latency: Number((2.4 + Math.random() * 2.8).toFixed(1)),
    accuracy: Number((90 + Math.random() * 6.5).toFixed(1)), completed: Math.round(8 + Math.random() * 10),
    collaboration: Number((80 + Math.random() * 11).toFixed(1)), currentTask: taskTemplate(a.id, 'intake', scenario),
  }));
}

function buildInitialEvents() {
  const seed = generateSystemLogs(10);
  return seed.map((l, i) => ({
    id: uid(`seed-${i}`), time: l.time, level: l.level,
    source: ['orchestrator','predictor','signal','traffic','transit'][i % 5],
    stage: ['感知摄取','策略规划','并行执行'][i % 3], message: l.msg,
  }));
}

function buildInitialTraceEntries() {
  const now = Date.now();
  return [
    { id: 't1', node: 'intake_agent',    label: '感知摄取',  color: '#7ab8d8', startMs: now - 9200, durationMs: 1100, status: 'completed' },
    { id: 't2', node: 'planner_agent',   label: '策略规划',  color: '#00c3ff', startMs: now - 8100, durationMs: 900,  status: 'completed' },
    { id: 't3', node: 'signal_agent',    label: '信控优化',  color: '#ff9500', startMs: now - 7200, durationMs: 780,  status: 'completed' },
    { id: 't4', node: 'traffic_agent',   label: '交通管控',  color: '#ff6b6b', startMs: now - 7200, durationMs: 820,  status: 'completed' },
    { id: 't5', node: 'transit_agent',   label: '公交协同',  color: '#b24bff', startMs: now - 7200, durationMs: 660,  status: 'completed' },
    { id: 't6', node: 'travel_agent',    label: '出行服务',  color: '#ffd700', startMs: now - 7200, durationMs: 710,  status: 'completed' },
    { id: 't7', node: 'simulation_agent',label: '仿真推演',  color: '#00ffc8', startMs: now - 6100, durationMs: 1400, status: 'completed' },
    { id: 't8', node: 'critic_agent',    label: '一致性校验',color: '#ffd700', startMs: now - 4600, durationMs: 960,  status: 'running' },
  ];
}

const NODE_COLOR_MAP = {
  ...Object.fromEntries(LG_NODES.map(n => [n.id, n.color || '#00c3ff'])),
  travel_service_agent: '#ffd700',
};
const NODE_LABEL_MAP = {
  ...Object.fromEntries(LG_NODES.map(n => [n.id, n.label || n.id])),
  travel_service_agent: '出行服务',
};

/** 后端 trace 节点名 → 前端 DAG 节点 id */
function dagNodeIdFromTraceNode(node) {
  if (node === 'travel_service_agent') return 'travel_agent';
  return node;
}

/** 根据 _node_trace 同步六段式阶段板（与 LangGraph 真实执行一致） */
function buildStagesFromWorkflowTrace(workflow) {
  const raw = workflow?._node_trace;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set(raw.map(t => dagNodeIdFromTraceNode(t.node)));
  const execIds = ['signal_agent', 'traffic_agent', 'transit_agent', 'travel_agent'];
  const execDone = execIds.every(id => seen.has(id));

  if (seen.has('report_agent')) {
    return STAGE_TEMPLATES.map(s => ({ ...s, status: 'completed', progress: 100 }));
  }

  return STAGE_TEMPLATES.map((s) => {
    if (s.id === 'intake') {
      const done = seen.has('intake_agent');
      return { ...s, status: done ? 'completed' : 'running', progress: done ? 100 : 35 };
    }
    if (s.id === 'plan') {
      const done = seen.has('planner_agent');
      const prev = seen.has('intake_agent');
      return { ...s, status: done ? 'completed' : prev ? 'running' : 'pending', progress: done ? 100 : prev ? 50 : 0 };
    }
    if (s.id === 'execute') {
      const prev = seen.has('planner_agent');
      return { ...s, status: execDone ? 'completed' : prev ? 'running' : 'pending', progress: execDone ? 100 : Math.round((execIds.filter(id => seen.has(id)).length / 4) * 88) };
    }
    if (s.id === 'simulate') {
      const done = seen.has('simulation_agent');
      return { ...s, status: done ? 'completed' : execDone ? 'running' : 'pending', progress: done ? 100 : execDone ? 55 : 0 };
    }
    if (s.id === 'critic') {
      const done = seen.has('critic_agent');
      const prev = seen.has('simulation_agent');
      return { ...s, status: done ? 'completed' : prev ? 'running' : 'pending', progress: done ? 100 : prev ? 62 : 0 };
    }
    if (s.id === 'refine') {
      const hasRep = seen.has('report_agent');
      const hasRef = seen.has('refine_agent');
      const prev = seen.has('critic_agent');
      if (hasRep) return { ...s, status: 'completed', progress: 100 };
      if (hasRef) return { ...s, status: 'running', progress: 78 };
      if (prev) return { ...s, status: 'pending', progress: 0 };
      return { ...s, status: 'pending', progress: 0 };
    }
    return { ...s, status: 'pending', progress: 0 };
  });
}

function deriveStageIndexFromWorkflow(workflow) {
  const stages = buildStagesFromWorkflowTrace(workflow);
  if (!stages) return null;
  if (stages.every(x => x.status === 'completed')) return STAGE_TEMPLATES.length;
  const ri = stages.findIndex(x => x.status === 'running');
  return ri >= 0 ? ri : 0;
}

function traceDagCompletedList(workflow) {
  const raw = workflow?._node_trace;
  if (!Array.isArray(raw) || !raw.length) return null;
  return [...new Set(raw.map(t => dagNodeIdFromTraceNode(t.node)))];
}

function workflowEventsToUiEvents(coordinationEvents) {
  if (!Array.isArray(coordinationEvents) || !coordinationEvents.length) return [];
  return coordinationEvents.slice().reverse().map((ev, i) => ({
    id: ev.id || `wf-ce-${i}`,
    time: typeof ev.ts === 'string' ? ev.ts.slice(11, 19) : '—',
    level: ev.severity || 'info',
    source: (ev.source || 'agent').replace(/_agent$/, ''),
    stage: ev.kind || 'event',
    message: ev.summary || '',
  }));
}

function formatDurationMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return '—';
  if (value <= 0) return '0ms';
  if (value < 1) return `${value.toFixed(3)}ms`;
  if (value < 10) return `${value.toFixed(2)}ms`;
  if (value < 100) return `${value.toFixed(1)}ms`;
  if (value < 1000) return `${value.toFixed(0)}ms`;
  if (value < 10000) return `${(value / 1000).toFixed(2)}s`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatRiskItem(risk) {
  if (risk == null) return '未提供风险信息';
  if (typeof risk === 'string') return risk;
  if (typeof risk !== 'object') return String(risk);

  const parts = [];
  if (risk.level) parts.push(`[${risk.level}]`);
  parts.push(risk.item || risk.title || risk.name || `风险 ${risk.id || ''}`.trim());
  if (risk.mitigation) parts.push(`缓解：${risk.mitigation}`);
  if (risk.owner) parts.push(`责任：${risk.owner}`);
  return parts.filter(Boolean).join('；');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function markdownToSimpleHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const parts = [];
  let inList = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList();
      if (!inCode) {
        parts.push('<pre><code>');
        inCode = true;
      } else {
        parts.push('</code></pre>');
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      parts.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const list = line.match(/^[-*]\s+(.*)$/);
    if (list) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${renderInlineMarkdown(list[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      parts.push('<div class="report-gap"></div>');
      continue;
    }

    closeList();
    parts.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  if (inCode) parts.push('</code></pre>');
  return parts.join('');
}

function buildCoordinationMarkdown(workflow) {
  if (!workflow) return '';
  const objectives = Array.isArray(workflow.coordination_objectives) ? workflow.coordination_objectives : [];
  const actions = Array.isArray(workflow.agent_actions) ? workflow.agent_actions : [];
  const risks = Array.isArray(workflow.risk_register) ? workflow.risk_register : [];
  const contract = workflow.coordination_contract || {};
  const kpi = workflow.kpi_projection || {};
  const before = kpi.before || {};
  const after = kpi.after || {};
  const sections = [
    `# 协同产出报告`,
    ``,
    `- 任务ID：${workflow.mission_id || '未提供'}`,
    `- 共识评分：${workflow.consensus_score ?? '未提供'}`,
    `- 修订轮次：${workflow.revision_round ?? 0}`,
    ``,
  ];

  if (objectives.length) {
    sections.push(`## 协同目标`);
    objectives.forEach(item => sections.push(`- ${item}`));
    sections.push('');
  }

  sections.push(`## 协同契约`);
  [
    ['提速目标', contract.target_speed_gain_pct, '%'],
    ['拥堵下降', contract.target_congestion_drop_pct, '%'],
    ['延误下降', contract.target_delay_drop_pct, '%'],
    ['匝道上限', contract.max_ramp_drop_pct, '%'],
    ['绿信比下限', contract.min_signal_green_ext_pct, '%'],
    ['公交运力下限', contract.min_transit_boost_pct, '%'],
  ].forEach(([label, value, unit]) => {
    if (value != null && value !== '') sections.push(`- ${label}：${value}${unit}`);
  });
  if (Array.isArray(contract.hard_constraints) && contract.hard_constraints.length) {
    sections.push(`- 硬约束：${contract.hard_constraints.join('；')}`);
  }
  sections.push('');

  if (actions.length) {
    sections.push(`## 各专业动作`);
    actions.forEach(item => {
      sections.push(`- **${item.agent || 'agent'}**：${item.title || '动作'}${item.detail ? ` - ${item.detail}` : ''}`);
    });
    sections.push('');
  }

  if (before.avg_speed_mph != null || after.avg_speed_mph != null) {
    sections.push(`## KPI 投影`);
    sections.push(`- 均速：${before.avg_speed_mph ?? '—'} -> ${after.avg_speed_mph ?? '—'} mph`);
    sections.push(`- 拥堵：${before.congestion_pct ?? '—'} -> ${after.congestion_pct ?? '—'} %`);
    sections.push(`- 延误：${before.delay_min ?? '—'} -> ${after.delay_min ?? '—'} min`);
    sections.push('');
  }

  if (workflow.critique || risks.length) {
    sections.push(`## Critic 评估`);
    if (workflow.critique) sections.push(workflow.critique, '');
    if (risks.length) {
      sections.push(`### 风险清单`);
      risks.forEach(item => {
        sections.push(`- [${item.level || 'risk'}] ${item.item || '未命名风险'}${item.mitigation ? `；缓解：${item.mitigation}` : ''}`);
      });
      sections.push('');
    }
  }

  if (workflow.executive_summary) {
    sections.push(`## 执行摘要`, workflow.executive_summary, '');
  }

  if (workflow.final_report) {
    sections.push(`## Markdown 报告`, workflow.final_report);
  }

  return sections.join('\n');
}

function buildExportHtml(title, markdown, missionId) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #102033; padding: 32px; line-height: 1.75; }
    h1,h2,h3,h4 { color: #0a5b8f; margin: 18px 0 10px; }
    p, li { font-size: 14px; }
    ul { padding-left: 20px; }
    code { background: #eef5fb; padding: 2px 6px; border-radius: 4px; }
    pre { background: #eef5fb; padding: 12px; border-radius: 8px; overflow: auto; }
    .meta { margin-bottom: 18px; color: #456; font-size: 13px; }
    .report-gap { height: 8px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">任务ID：${escapeHtml(missionId || '未提供')}</div>
  ${markdownToSimpleHtml(markdown)}
</body>
</html>`;
}

function downloadBlob(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function normalizeMissionDetailPayload(payload) {
  if (!payload) return { workflow_state: {}, hitl_decisions: [] };
  const workflow = payload.result || {};
  const trace = Array.isArray(payload.trace) ? payload.trace : Array.isArray(workflow._node_trace) ? workflow._node_trace : [];
  return {
    workflow_state: { ...workflow, _node_trace: trace },
    llm_enhanced_report: workflow.executive_summary || '',
    hitl_decisions: payload.hitl_decisions || [],
    _meta: {
      created_at: payload.created_at || null,
      mission_id: payload.mission_id || null,
      dataset: payload.dataset || null,
      scenario: payload.scenario || null,
      source: 'history',
    },
  };
}

function buildInitialState(scenarioId = SCENARIOS[0].id) {
  const scenario = getScenarioById(scenarioId);
  return {
    scenarioId: scenario.id, running: false, tickMs: 1800, cycle: 1,
    stageIndex: 0, stages: buildIdleStages(),
    agents: buildInitialAgents(scenario), events: [],
    selectedAgent: 'orchestrator',
    consensusScore: 0,
    kpi: { speed: scenario.avgSpeed[0], congestion: scenario.baselineCongestion, delay: scenario.baselineDelay, throughput: scenario.baselineThroughput, targetSpeedGain: 16, targetCongestionDrop: 20 },
    backend: { loading: false, error: '', result: null, updatedAt: null, streaming: false, streamNodes: [], overview: null },
    ws: { connected: false, lastEventAt: null, reconnecting: false },
    innerTab: 0,
    hitl: { decisions: [], pendingRisks: [] },
    chat: { messages: [], streaming: false },
    trace: { entries: [], selectedNode: null, fromBackend: false },
    missionHistory: [],
    /** 为 true 时阶段条/拓扑上的数值为演示动画；后端跑完后冻结为 false，避免「假编排」误导 */
    coordinationDemo: false,
  };
}

// ============================================================
// REDUCER
// ============================================================
function dashboardReducer(state, action) {
  switch (action.type) {
    case 'RESET_SCENARIO': {
      const next = buildInitialState(action.scenarioId);
      return {
        ...next,
        ws: state.ws,
        innerTab: state.innerTab,
        missionHistory: state.missionHistory,
        backend: { ...next.backend, overview: state.backend.overview },
      };
    }
    case 'TOGGLE_RUNNING':
      return { ...state, running: !state.running };
    case 'SET_TICK':
      return { ...state, tickMs: action.tickMs };
    case 'SELECT_AGENT':
      return { ...state, selectedAgent: action.agentId };
    case 'SET_INNER_TAB':
      return { ...state, innerTab: action.tab };
    case 'TRACE_SELECT':
      return { ...state, trace: { ...state.trace, selectedNode: action.nodeId } };

    case 'HITL_DECIDE': {
      const { riskId, action: act, reason } = action;
      const existing = state.hitl.decisions.find(d => d.riskId === riskId);
      const newDecision = { riskId, action: act, reason: reason || '', ts: new Date().toTimeString().slice(0, 8) };
      const decisions = existing
        ? state.hitl.decisions.map(d => d.riskId === riskId ? newDecision : d)
        : [newDecision, ...state.hitl.decisions];
      return { ...state, hitl: { ...state.hitl, decisions } };
    }

    case 'CHAT_ADD_USER': {
      const msg = { id: uid('chat'), role: 'user', content: action.content, ts: new Date().toTimeString().slice(0, 8) };
      return { ...state, chat: { ...state.chat, messages: [...state.chat.messages, msg], streaming: true } };
    }
    case 'CHAT_START_ASSISTANT': {
      const msg = { id: uid('chat-ai'), role: 'assistant', content: '', ts: new Date().toTimeString().slice(0, 8) };
      return { ...state, chat: { ...state.chat, messages: [...state.chat.messages, msg] } };
    }
    case 'CHAT_APPEND_TOKEN': {
      const msgs = state.chat.messages.map((m, i) =>
        i === state.chat.messages.length - 1 && m.role === 'assistant'
          ? { ...m, content: m.content + action.token }
          : m
      );
      return { ...state, chat: { ...state.chat, messages: msgs } };
    }
    case 'CHAT_DONE':
      return { ...state, chat: { ...state.chat, streaming: false } };
    case 'CHAT_ERROR': {
      const msgs = state.chat.messages.map((m, i) =>
        i === state.chat.messages.length - 1 && m.role === 'assistant'
          ? { ...m, content: m.content || `[错误] ${action.error}` }
          : m
      );
      return { ...state, chat: { ...state.chat, messages: msgs, streaming: false } };
    }

    case 'OVERVIEW_LOADED':
      return { ...state, backend: { ...state.backend, overview: action.payload || null } };

    case 'BACKEND_START': {
      const scenario = getScenarioById(state.scenarioId);
      return {
        ...state,
        running: false,
        coordinationDemo: false,
        backend: {
          ...state.backend,
          loading: true,
          error: '',
          result: null,
          updatedAt: null,
          streaming: false,
          streamNodes: [],
        },
        stageIndex: 0,
        stages: buildIdleStages(),
        cycle: 1,
        consensusScore: 0,
        kpi: {
          speed: scenario.avgSpeed[0],
          congestion: scenario.baselineCongestion,
          delay: scenario.baselineDelay,
          throughput: scenario.baselineThroughput,
          targetSpeedGain: 16,
          targetCongestionDrop: 20,
        },
        agents: buildInitialAgents(scenario),
        events: [],
        hitl: { decisions: [], pendingRisks: [], allRisks: [] },
        trace: { ...state.trace, entries: [], selectedNode: null, fromBackend: false },
      };
    }

    case 'STREAM_NODE_EVENT': {
      // 单个节点完成事件（来自 /run/stream SSE）
      const { node, durationMs, startMs } = action;
      const entry = {
        id: `sn-${node}`,
        node,
        label: NODE_LABEL_MAP[node] || node,
        color: NODE_COLOR_MAP[node] || '#00c3ff',
        startMs: startMs || Date.now(),
        durationMs: durationMs || 0,
        status: 'completed',
      };
      const existingNodes = state.backend.streamNodes || [];
      const updatedNodes = [...existingNodes.filter(e => e.node !== node), entry]
        .sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
      const traceEntries = updatedNodes.map(item => ({
        ...item,
        node: dagNodeIdFromTraceNode(item.node),
        label: NODE_LABEL_MAP[item.node] || NODE_LABEL_MAP[dagNodeIdFromTraceNode(item.node)] || item.label,
      }));
      const streamWorkflow = {
        _node_trace: updatedNodes.map(item => ({
          node: item.node,
          status: item.status,
          start_ms: item.startMs,
          duration_ms: item.durationMs,
        })),
      };
      return {
        ...state,
        backend: { ...state.backend, streaming: true, streamNodes: updatedNodes },
        trace: { ...state.trace, entries: traceEntries, fromBackend: true },
        stages: buildStagesFromWorkflowTrace(streamWorkflow) || state.stages,
        stageIndex: deriveStageIndexFromWorkflow(streamWorkflow) ?? state.stageIndex,
      };
    }

    case 'BACKEND_SUCCESS': {
      const payload = action.payload || {};
      const workflow = payload.workflow_state || payload.result || {};
      const workflowActions = Array.isArray(workflow.agent_actions) ? workflow.agent_actions : [];
      const agentMap = { signal: 'signal', traffic_control: 'traffic', transit: 'transit', travel_service: 'travel', planner: 'orchestrator', orchestrator: 'orchestrator' };
      const nextAgents = state.agents.map(agent => {
        const found = workflowActions.find(item => agentMap[item.agent] === agent.id);
        if (!found) return agent;
        return { ...agent, status: 'processing', queue: clamp(agent.queue + 8, 0, 99), currentTask: found.title ? `${found.title}：${found.detail || ''}` : found.detail || agent.currentTask };
      });
      let nextKpi = state.kpi;
      if (workflow.kpi_projection?.after) {
        nextKpi = { ...nextKpi, speed: Number(workflow.kpi_projection.after.avg_speed_mph ?? nextKpi.speed), congestion: Number(workflow.kpi_projection.after.congestion_pct ?? nextKpi.congestion), delay: Number(workflow.kpi_projection.after.delay_min ?? nextKpi.delay), throughput: Number(workflow.kpi_projection.after.throughput_index ?? nextKpi.throughput) };
      }
      const consensus = Number(workflow.consensus_score);
      const riskRegister = Array.isArray(workflow.risk_register) ? workflow.risk_register : [];
      const backendDecisions = (payload.hitl_decisions || []).map(d => ({
        riskId: d.riskId || d.risk_id,
        action: d.action,
        reason: d.reason || '',
        ts: d.ts || (d.decided_at ? d.decided_at.slice(11, 19) : new Date().toTimeString().slice(0, 8)),
      }));
      const decisionSource = backendDecisions.length ? backendDecisions : state.hitl.decisions;
      const pendingRisks = riskRegister.filter(r => !decisionSource.some(d => d.riskId === r.id));

      // 从后端真实 _node_trace 构建执行轨迹
      const rawTrace = Array.isArray(workflow._node_trace) ? workflow._node_trace : [];
      let traceEntries = state.trace.entries;
      let traceFromBackend = state.trace.fromBackend;
      if (rawTrace.length > 0) {
        traceEntries = rawTrace.map((t, idx) => ({
          id: `bt-${idx}-${t.node}`,
          node: dagNodeIdFromTraceNode(t.node),
          label: NODE_LABEL_MAP[t.node] || NODE_LABEL_MAP[dagNodeIdFromTraceNode(t.node)] || t.node,
          color: NODE_COLOR_MAP[t.node] || NODE_COLOR_MAP[dagNodeIdFromTraceNode(t.node)] || '#00c3ff',
          startMs: t.start_ms || Date.now(),
          durationMs: t.duration_ms || 0,
          status: t.status || 'completed',
        }));
        traceFromBackend = true;
      } else if ((state.backend.streamNodes || []).length > 0) {
        traceEntries = state.backend.streamNodes.map(e => ({
          ...e,
          node: dagNodeIdFromTraceNode(e.node),
          label: NODE_LABEL_MAP[e.node] || e.label,
        }));
        traceFromBackend = true;
      }

      const stagesFromWf = buildStagesFromWorkflowTrace(workflow);
      const nextStageIndex = deriveStageIndexFromWorkflow(workflow);
      const wfEvents = workflowEventsToUiEvents(workflow.coordination_events);

      return {
        ...state,
        coordinationDemo: false,
        agents: nextAgents,
        kpi: nextKpi,
        consensusScore: Number.isFinite(consensus) ? consensus : state.consensusScore,
        backend: {
          ...state.backend,
          loading: false,
          error: '',
          result: {
            workflow_state: workflow,
            llm_enhanced_report: payload.llm_enhanced_report || '',
            _meta: payload._meta || state.backend.result?._meta || null,
          },
          updatedAt: new Date().toISOString(),
          streaming: false,
          streamNodes: [],
        },
        hitl: { ...state.hitl, pendingRisks, allRisks: riskRegister, decisions: decisionSource },
        trace: { ...state.trace, entries: traceEntries, fromBackend: traceFromBackend },
        stages: stagesFromWf || state.stages,
        stageIndex: nextStageIndex ?? state.stageIndex,
        events: wfEvents.length
          ? [...wfEvents, ...state.events.filter(e => !String(e.id).startsWith('seed-'))].slice(0, 100)
          : state.events,
      };
    }
    case 'BACKEND_ERROR':
      return { ...state, backend: { ...state.backend, loading: false, error: action.error || '执行失败', streaming: false } };

    case 'MISSION_HISTORY_LOADED':
      return { ...state, missionHistory: action.missions || [] };

    case 'HITL_SYNCED_FROM_BACKEND': {
      // 从后端加载 HITL 决策（数据结构略有不同）
      const backendDecisions = (action.decisions || []).map(d => ({
        riskId: d.risk_id,
        action: d.action,
        reason: d.reason || '',
        ts: d.decided_at ? d.decided_at.slice(11, 19) : new Date().toTimeString().slice(0, 8),
      }));
      return { ...state, hitl: { ...state.hitl, decisions: backendDecisions } };
    }

    case 'CLEAR_BACKEND': {
      const scenario = getScenarioById(state.scenarioId);
      return {
        ...state,
        coordinationDemo: false,
        running: false,
        backend: { ...state.backend, loading: false, error: '', result: null, updatedAt: null, streaming: false, streamNodes: [] },
        stageIndex: 0,
        stages: buildIdleStages(),
        cycle: 1,
        consensusScore: 0,
        kpi: {
          speed: scenario.avgSpeed[0],
          congestion: scenario.baselineCongestion,
          delay: scenario.baselineDelay,
          throughput: scenario.baselineThroughput,
          targetSpeedGain: 16,
          targetCongestionDrop: 20,
        },
        agents: buildInitialAgents(scenario),
        events: [],
        hitl: { decisions: [], pendingRisks: [], allRisks: [] },
        trace: { entries: [], selectedNode: null, fromBackend: false },
      };
    }

    case 'HITL_APPLY_SUCCESS': {
      const ws = action.workflowState || {};
      const rr = Array.isArray(ws.risk_register) ? ws.risk_register : state.hitl.allRisks || [];
      const cs = Number(ws.consensus_score);
      const workflowActions = Array.isArray(ws.agent_actions) ? ws.agent_actions : [];
      const agentMap = { signal: 'signal', traffic_control: 'traffic', transit: 'transit', travel_service: 'travel', planner: 'orchestrator', orchestrator: 'orchestrator' };
      const nextAgents = state.agents.map(agent => {
        const found = workflowActions.find(item => agentMap[item.agent] === agent.id);
        if (!found) return agent;
        return { ...agent, status: 'processing', queue: clamp(agent.queue + 6, 0, 99), currentTask: found.title ? `${found.title}：${found.detail || ''}` : found.detail || agent.currentTask };
      });
      let nextKpi = state.kpi;
      if (ws.kpi_projection?.after) {
        nextKpi = {
          ...nextKpi,
          speed: Number(ws.kpi_projection.after.avg_speed_mph ?? nextKpi.speed),
          congestion: Number(ws.kpi_projection.after.congestion_pct ?? nextKpi.congestion),
          delay: Number(ws.kpi_projection.after.delay_min ?? nextKpi.delay),
          throughput: Number(ws.kpi_projection.after.throughput_index ?? nextKpi.throughput),
        };
      }
      const rawTrace = Array.isArray(ws._node_trace) ? ws._node_trace : [];
      const traceEntries = rawTrace.length
        ? rawTrace.map((t, idx) => ({
          id: `bt-${idx}-${t.node}`,
          node: dagNodeIdFromTraceNode(t.node),
          label: NODE_LABEL_MAP[t.node] || NODE_LABEL_MAP[dagNodeIdFromTraceNode(t.node)] || t.node,
          color: NODE_COLOR_MAP[t.node] || NODE_COLOR_MAP[dagNodeIdFromTraceNode(t.node)] || '#00c3ff',
          startMs: t.start_ms || Date.now(),
          durationMs: t.duration_ms || 0,
          status: t.status || 'completed',
        }))
        : state.trace.entries;
      const stagesFromWf = buildStagesFromWorkflowTrace(ws);
      const nextStageIndex = deriveStageIndexFromWorkflow(ws);
      const wfEvents = workflowEventsToUiEvents(ws.coordination_events);
      return {
        ...state,
        coordinationDemo: false,
        agents: nextAgents,
        kpi: nextKpi,
        consensusScore: Number.isFinite(cs) ? cs : state.consensusScore,
        backend: { ...state.backend, result: { workflow_state: ws }, updatedAt: new Date().toISOString() },
        hitl: { ...state.hitl, allRisks: rr, pendingRisks: [] },
        stages: stagesFromWf || state.stages,
        stageIndex: nextStageIndex ?? state.stageIndex,
        trace: { ...state.trace, entries: traceEntries, fromBackend: rawTrace.length > 0 },
        events: wfEvents.length ? [...wfEvents, ...state.events.filter(e => !String(e.id).startsWith('seed-'))].slice(0, 100) : state.events,
      };
    }

    case 'WS_STATUS':
      return { ...state, ws: { ...state.ws, connected: Boolean(action.connected), reconnecting: Boolean(action.reconnecting) } };
    case 'WS_EVENT': {
      const payload = action.payload || {};
      const eventType = payload.type;
      const event = payload.event || {};
      if (eventType === 'workflow_started') {
        const mapped = { id: uid('ws-start'), time: new Date().toTimeString().slice(0, 8), level: 'info', source: 'orchestrator', stage: 'workflow', message: `任务 ${payload.mission_id || '-'} 启动：${payload.scenario || ''}` };
        return { ...state, events: [mapped, ...state.events].slice(0, 120), ws: { ...state.ws, lastEventAt: new Date().toISOString() } };
      }
      if (eventType === 'coordination_event') {
        const mapped = { id: event.id || uid('ws'), time: typeof event.ts === 'string' ? event.ts.slice(11, 19) : new Date().toTimeString().slice(0, 8), level: event.severity || 'info', source: event.source || 'backend', stage: event.kind || 'workflow', message: event.summary || '后端协同事件' };
        return { ...state, events: [mapped, ...state.events].slice(0, 120), ws: { ...state.ws, lastEventAt: new Date().toISOString() } };
      }
      if (eventType === 'workflow_completed') {
        const cs = Number(payload.consensus_score);
        let nextKpi = state.kpi;
        const after = payload.kpi_projection?.after;
        if (after) nextKpi = { ...nextKpi, speed: Number(after.avg_speed_mph ?? nextKpi.speed), congestion: Number(after.congestion_pct ?? nextKpi.congestion), delay: Number(after.delay_min ?? nextKpi.delay), throughput: Number(after.throughput_index ?? nextKpi.throughput) };
        return { ...state, kpi: nextKpi, consensusScore: Number.isFinite(cs) ? cs : state.consensusScore, ws: { ...state.ws, lastEventAt: new Date().toISOString() } };
      }
      return state;
    }

    case 'TICK': {
      if (!state.coordinationDemo) {
        return state;
      }
      const scenario = getScenarioById(state.scenarioId);
      let stageIndex = state.stageIndex;
      let cycle = state.cycle;
      let currentProgress = clamp(state.stages[stageIndex].progress + (12 + Math.random() * 16), 0, 100);
      if (currentProgress >= 100) {
        stageIndex += 1;
        if (stageIndex >= STAGE_TEMPLATES.length) { stageIndex = 0; cycle += 1; }
        currentProgress = 6 + Math.random() * 12;
      }
      const stages = STAGE_TEMPLATES.map((s, i) => {
        if (i < stageIndex) return { ...s, status: 'completed', progress: 100 };
        if (i === stageIndex) return { ...s, status: 'running', progress: Number(currentProgress.toFixed(1)) };
        return { ...s, status: 'pending', progress: 0 };
      });
      const activeStage = STAGE_TEMPLATES[stageIndex];
      const activeOwners = new Set(activeStage.owners);
      const nextAgents = state.agents.map(agent => {
        const ownerBoost = activeOwners.has(agent.id) ? 1 : 0;
        const cpu = clamp(agent.cpu + (Math.random() - 0.5) * 11 + (ownerBoost ? 5 : -1.5), 8, 97);
        const memory = clamp(agent.memory + (Math.random() - 0.5) * 7 + (ownerBoost ? 2 : -0.8), 12, 96);
        const queue = clamp(ownerBoost ? agent.queue + 8 + (Math.random() - 0.3) * 10 : agent.queue + (Math.random() - 0.55) * 11, 2, 98);
        const latency = clamp(agent.latency + (ownerBoost ? (Math.random() - 0.32) * 0.9 : (Math.random() - 0.62) * 0.45), 1.6, 12.6);
        const accuracy = clamp(agent.accuracy + (Math.random() - 0.5) * 1.4, 82, 99.8);
        const collaboration = clamp(agent.collaboration + (Math.random() - 0.46) * 2.4 + (ownerBoost ? 1.1 : -0.2), 62, 99);
        const completed = agent.completed + (ownerBoost && Math.random() > 0.38 ? 1 + Math.floor(Math.random() * 2) : 0);
        let status = ownerBoost ? (cpu > 82 || queue > 76 ? 'processing' : 'running') : queue > 72 ? 'processing' : 'standby';
        if (Math.random() < 0.014 && cpu > 90) status = 'error';
        if (agent.status === 'error' && Math.random() > 0.64) status = 'processing';
        return { ...agent, cpu: Number(cpu.toFixed(0)), memory: Number(memory.toFixed(0)), queue: Number(queue.toFixed(0)), latency: Number(latency.toFixed(1)), accuracy: Number(accuracy.toFixed(1)), collaboration: Number(collaboration.toFixed(1)), completed, status, currentTask: taskTemplate(agent.id, activeStage.id, scenario) };
      });
      let consensusScore = clamp(state.consensusScore + (Math.random() - 0.48) * 2.6 + (activeStage.id === 'critic' ? 1.8 : 0.2) - (activeStage.id === 'refine' ? 0.9 : 0), 58, 99.6);
      if (nextAgents.some(a => a.status === 'error')) consensusScore = clamp(consensusScore - 4.8, 50, 99.6);
      const speed = clamp(state.kpi.speed + (consensusScore > 86 ? 0.46 : -0.08) + (Math.random() - 0.42) * 0.75, 18, 82);
      const congestion = clamp(state.kpi.congestion + (consensusScore > 86 ? -0.62 : 0.28) + (Math.random() - 0.5) * 0.95, 7, 72);
      const delay = clamp(state.kpi.delay + (consensusScore > 86 ? -0.22 : 0.14) + (Math.random() - 0.5) * 0.42, 4, 34);
      const throughput = clamp(state.kpi.throughput + (consensusScore > 86 ? 0.42 : 0.06) + (Math.random() - 0.45) * 0.34, 38, 96);
      // Update trace
      const now = Date.now();
      const traceEntries = state.trace.entries.map(e => {
        if (e.status === 'running' && now - e.startMs > 2000 + Math.random() * 1000) return { ...e, status: 'completed', durationMs: now - e.startMs };
        return e;
      });
      return { ...state, cycle, stageIndex, stages, agents: nextAgents, consensusScore: Number(consensusScore.toFixed(1)), kpi: { ...state.kpi, speed: Number(speed.toFixed(1)), congestion: Number(congestion.toFixed(1)), delay: Number(delay.toFixed(1)), throughput: Number(throughput.toFixed(1)) }, trace: { ...state.trace, entries: traceEntries } };
    }
    default:
      return state;
  }
}

// ============================================================
// LANGGRAPH DAG COMPONENT
// ============================================================
function LangGraphDAG({ stageIndex, stages, backendResult, cycle, traceCompletedIds, workflowAllDone }) {
  const nodeWidth = 148;
  const nodeHeight = 28;
  const cx = 95;
  const spacing = 44;
  const mainNodes = LG_NODES.filter(n => !n.branch);
  const branchNodes = LG_NODES.filter(n => n.branch);
  const totalH = (mainNodes.length - 2) * spacing + nodeHeight * 2 + 100; // -2 for start/end terminals, +100 for branch area

  function traceHas(dagNodeId) {
    if (!traceCompletedIds?.length) return false;
    if (traceCompletedIds.includes(dagNodeId)) return true;
    if (dagNodeId === 'travel_agent' && traceCompletedIds.includes('travel_service_agent')) return true;
    return false;
  }

  function getNodeStatus(node) {
    if (traceCompletedIds?.length) {
      if (node.type === 'terminal') {
        if (node.id === 'start') return traceHas('intake_agent') ? 'completed' : 'idle';
        if (node.id === 'end') return workflowAllDone ? 'completed' : 'idle';
        return 'idle';
      }
      if (traceHas(node.id)) return 'completed';
      return 'idle';
    }
    if (!node.stageId) return 'idle';
    const si = STAGE_TEMPLATES.findIndex(s => s.id === node.stageId);
    if (si < 0) return 'idle';
    if (si < stageIndex) return 'completed';
    if (si === stageIndex) return 'active';
    return 'idle';
  }

  // Build node y positions for main flow (excluding branch nodes, start/end have special positions)
  const nodeYMap = {};
  let y = 12;
  for (const n of LG_NODES) {
    if (n.branch) continue;
    nodeYMap[n.id] = y;
    y += (n.type === 'terminal' ? 22 : nodeHeight) + (n.type === 'terminal' ? 18 : 16);
  }
  // Override: branch nodes at special y
  const criticY = nodeYMap['critic_agent'];
  const branchY = criticY + nodeHeight + 30;
  const endY = branchY + nodeHeight + 30;
  nodeYMap['end'] = endY;
  nodeYMap['refine_agent'] = branchY;
  nodeYMap['report_agent'] = branchY;

  const svgH = endY + 22 + 8;

  function nodeColor(node) {
    const status = getNodeStatus(node);
    if (status === 'active') return node.color;
    if (status === 'completed') return `${node.color}88`;
    return 'rgba(0,195,255,0.15)';
  }

  function nodeBorderColor(node) {
    const status = getNodeStatus(node);
    if (status === 'active') return node.color;
    if (status === 'completed') return `${node.color}55`;
    return 'rgba(0,195,255,0.2)';
  }

  function nodeTextColor(node) {
    const status = getNodeStatus(node);
    if (status === 'active') return '#fff';
    if (status === 'completed') return node.color;
    return '#4a7a99';
  }

  function NodeRect({ node, x, y, w, h }) {
    const status = getNodeStatus(node);
    const isActive = status === 'active';
    const isCompleted = status === 'completed';
    return (
      <g>
        {isActive && (
          <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={5} fill="none"
            stroke={node.color} strokeWidth="1.5" opacity="0.4"
            style={{ animation: 'lg-pulse 1.5s ease-in-out infinite' }} />
        )}
        <rect x={x} y={y} width={w} height={h} rx={4}
          fill={isActive ? `${node.color}22` : isCompleted ? `${node.color}10` : 'rgba(0,10,25,0.6)'}
          stroke={nodeBorderColor(node)} strokeWidth={isActive ? 1.5 : 1} />
        {node.icon && (
          <text x={x + 10} y={y + h / 2 + 4} fontSize={12}>{node.icon}</text>
        )}
        <text x={x + (node.icon ? 28 : 10)} y={y + h / 2 + 4} fontSize={10} fill={nodeTextColor(node)} fontWeight={isActive ? 700 : 400}>
          {node.label}
        </text>
        {isCompleted && (
          <text x={x + w - 16} y={y + h / 2 + 4} fontSize={10} fill={node.color}>✓</text>
        )}
        {isActive && (
          <circle cx={x + w - 12} cy={y + h / 2} r={3} fill={node.color} style={{ animation: 'breathe 1.2s ease-in-out infinite' }} />
        )}
      </g>
    );
  }

  function ArrowHead({ x, y, dir = 'down' }) {
    if (dir === 'down') return <polygon points={`${x},${y} ${x - 4},${y - 6} ${x + 4},${y - 6}`} fill="rgba(0,195,255,0.5)" />;
    if (dir === 'right') return <polygon points={`${x},${y} ${x - 6},${y - 4} ${x - 6},${y + 4}`} fill="rgba(0,195,255,0.5)" />;
    return null;
  }

  function FlowLine({ x1, y1, x2, y2, isActive, color }) {
    const strokeColor = isActive ? (color || '#00ffc8') : 'rgba(0,195,255,0.2)';
    const strokeW = isActive ? 2 : 1;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={strokeW} strokeDasharray={isActive ? '0' : '3,3'} />
        <ArrowHead x={x2} y={y2 + 2} />
        {isActive && <circle cx={x1} cy={y1 + (y2 - y1) / 2} r={2.5} fill={color || '#00ffc8'} style={{ animation: 'breathe 1s ease-in-out infinite' }} />}
      </g>
    );
  }

  // Build sequential edges
  const mainNodeIds = LG_NODES.filter(n => !n.branch).map(n => n.id);
  // Replace end temporarily for edge building
  const seqNodeIds = ['start', 'intake_agent', 'planner_agent', 'signal_agent', 'traffic_agent', 'transit_agent', 'travel_agent', 'simulation_agent', 'critic_agent'];

  return (
    <>
    <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        @keyframes lg-pulse {
          0%,100%{opacity:0.4;transform:scale(1);}
          50%{opacity:0.8;transform:scale(1.02);}
        }
        @keyframes flow-dash {
          0%{stroke-dashoffset:20;}
          100%{stroke-dashoffset:0;}
        }
      `}</style>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.1em', textAlign: 'center' }}>
        {traceCompletedIds?.length ? 'LangGraph · 后端执行轨迹' : `LangGraph Workflow · 第 ${cycle} 轮（演示）`}
      </div>
      <svg width={190} height={svgH} viewBox={`0 0 190 ${svgH}`} style={{ overflow: 'visible' }}>
        {/* Sequential edges */}
        {seqNodeIds.map((nid, i) => {
          if (i === seqNodeIds.length - 1) return null;
          const nextId = seqNodeIds[i + 1];
          const curY = nodeYMap[nid];
          const nextY = nodeYMap[nextId];
          const isT = LG_NODES.find(n => n.id === nid)?.type === 'terminal';
          const fromY = curY + (isT ? 14 : nodeHeight);
          const si1 = STAGE_TEMPLATES.findIndex(s => s.id === LG_NODES.find(n => n.id === nid)?.stageId);
          const isActive = si1 === stageIndex - 1 || si1 === stageIndex;
          return <FlowLine key={`e-${nid}`} x1={cx} y1={fromY} x2={cx} y2={nextY - 2} isActive={isActive} color={LG_NODES.find(n => n.id === nid)?.color} />;
        })}

        {/* critic → branch diamond area */}
        <FlowLine x1={cx} y1={nodeYMap['critic_agent'] + nodeHeight} x2={cx} y2={branchY - 14} isActive={stageIndex >= 4} />
        {/* Diamond */}
        <polygon points={`${cx},${branchY - 14} ${cx + 10},${branchY - 4} ${cx},${branchY + 6} ${cx - 10},${branchY - 4}`}
          fill="rgba(255,213,0,0.15)" stroke="#ffd700" strokeWidth={stageIndex >= 4 ? 1.5 : 0.8} />
        <text x={cx} y={branchY - 4 + 4} textAnchor="middle" fontSize={7} fill={stageIndex >= 4 ? '#ffd700' : '#4a7a99'}>条件</text>

        {/* branch → refine (left) */}
        <path d={`M ${cx - 10} ${branchY - 4} Q ${cx - 30} ${branchY + 5} ${40} ${branchY + nodeHeight / 2}`}
          fill="none" stroke={stageIndex === 5 ? '#ff6b9d' : 'rgba(0,195,255,0.15)'} strokeWidth={stageIndex === 5 ? 1.5 : 1} strokeDasharray="3,2" />
        {/* branch → report (right) */}
        <path d={`M ${cx + 10} ${branchY - 4} Q ${cx + 30} ${branchY + 5} ${150} ${branchY + nodeHeight / 2}`}
          fill="none" stroke={stageIndex >= 0 && stageIndex < 5 ? '#39ff6a' : 'rgba(0,195,255,0.15)'} strokeWidth={1} strokeDasharray="3,2" />

        {/* refine → loop back to signal */}
        <path d={`M 8 ${branchY + nodeHeight / 2} Q 0 ${branchY} 0 ${nodeYMap['signal_agent'] + nodeHeight / 2} Q 0 ${nodeYMap['signal_agent']} 20 ${nodeYMap['signal_agent'] + nodeHeight / 2}`}
          fill="none" stroke={stageIndex === 5 ? '#ff6b9d88' : 'rgba(255,107,157,0.2)'} strokeWidth={1.5} strokeDasharray="4,3"
          markerEnd="url(#arr)" />

        {/* report → END */}
        <path d={`M ${150} ${branchY + nodeHeight} Q 150 ${endY - 5} ${cx} ${endY - 2}`}
          fill="none" stroke="rgba(57,255,106,0.3)" strokeWidth={1} strokeDasharray="3,2" />

        {/* Render main nodes (non-branch) */}
        {LG_NODES.filter(n => !n.branch).map(node => {
          const y = nodeYMap[node.id];
          if (node.type === 'terminal') {
            return (
              <g key={node.id}>
                <ellipse cx={cx} cy={y + 11} rx={42} ry={11}
                  fill={node.id === 'start' ? 'rgba(0,255,200,0.15)' : 'rgba(0,255,200,0.08)'}
                  stroke={node.id === 'start'
                    ? ((traceCompletedIds?.length ? traceHas('intake_agent') : stageIndex > 0) ? '#00ffc8' : 'rgba(0,255,200,0.3)')
                    : (workflowAllDone || stageIndex >= STAGE_TEMPLATES.length - 1 ? '#00ffc8' : 'rgba(0,255,200,0.3)')}
                  strokeWidth={1.5} />
                <text x={cx} y={y + 15} textAnchor="middle" fontSize={10} fill="#00ffc8" fontWeight={700}>{node.label}</text>
              </g>
            );
          }
          return <NodeRect key={node.id} node={node} x={cx - nodeWidth / 2} y={y} w={nodeWidth} h={nodeHeight} />;
        })}

        {/* Branch nodes */}
        <NodeRect node={LG_NODES.find(n => n.id === 'refine_agent')} x={4} y={branchY} w={80} h={nodeHeight} />
        <NodeRect node={LG_NODES.find(n => n.id === 'report_agent')} x={106} y={branchY} w={80} h={nodeHeight} />
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>
        {[{c:'#00ffc8',l:'活跃'},{c:'#7ab8d8',l:'完成'},{c:'rgba(0,195,255,0.2)',l:'待命'}].map(item => (
          <span key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: item.c }} />
            {item.l}
          </span>
        ))}
      </div>
    </div>
    {false && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0, 8, 20, 0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="panel panel-glow-green" style={{ width: 'min(1380px, calc(100vw - 48px))', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' }}>
          <div className="panel-header" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="panel-title">协同产出详情</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{workflow?.mission_id || '—'}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleExportMarkdown} style={{ ...exportButtonStyle, color: '#00ffc8', background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.28)' }}>导出 .md</button>
              <button type="button" onClick={handleExportWord} style={{ ...exportButtonStyle, color: '#7ab8d8', background: 'transparent', border: '1px solid rgba(122,184,216,0.35)' }}>导出 Word(.doc)</button>
              <button type="button" onClick={handleExportPdf} style={{ ...exportButtonStyle, color: '#ffd700', background: 'rgba(255,213,0,0.08)', border: '1px solid rgba(255,213,0,0.28)' }}>导出 PDF</button>
              <button type="button" onClick={() => setDetailOpen(false)} style={{ ...exportButtonStyle, color: '#ff8c8c', background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.28)' }}>关闭</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(320px,0.8fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>协同目标</div>
                {objectives.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    {objectives.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回协同目标。</div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 320, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,255,200,0.14)', background: 'rgba(0,10,24,0.58)', overflow: 'auto' }}>
                <div style={{ fontSize: 11, color: '#00ffc8', fontWeight: 700, marginBottom: 8 }}>Markdown 报告</div>
                {finalReport ? <MarkdownContent>{finalReport}</MarkdownContent> : <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{exportMarkdown}</pre>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>协同契约</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {chip('提速目标', contract.target_speed_gain_pct, '%')}
                  {chip('拥堵下降', contract.target_congestion_drop_pct, '%')}
                  {chip('延误下降', contract.target_delay_drop_pct, '%')}
                  {chip('匝道上限', contract.max_ramp_drop_pct, '%')}
                  {chip('绿信比下限', contract.min_signal_green_ext_pct, '%')}
                  {chip('公交运力下限', contract.min_transit_boost_pct, '%')}
                </div>
                {Array.isArray(contract.hard_constraints) && contract.hard_constraints.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>硬约束：{contract.hard_constraints.join('；')}</div>
                )}
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>动作清单</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                  {actions.length > 0 ? actions.map(actionCard) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回专业动作。</div>}
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>结果摘要</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    <strong style={{ color: '#7ab8d8' }}>执行摘要：</strong>{execSummary || brief || '—'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                    <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(0,10,24,0.42)', fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      均速 {before.avg_speed_mph ?? '—'} {'->'} {after.avg_speed_mph ?? '—'} mph
                    </div>
                    <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(0,10,24,0.42)', fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      拥堵 {before.congestion_pct ?? '—'} {'->'} {after.congestion_pct ?? '—'} %
                    </div>
                  </div>
                  <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(255,213,0,0.05)', border: '1px solid rgba(255,213,0,0.18)' }}>
                    <div style={{ fontSize: 10.5, color: '#ffd700', fontWeight: 700, marginBottom: 6 }}>Critic / 风险</div>
                    {critique && <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{critique}</div>}
                    {risks.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {risks.map((risk, idx) => <li key={`${risk.id || idx}-${idx}`}>{formatRiskItem(risk)}</li>)}
                      </ul>
                    )}
                    {!critique && risks.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回风险项。</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ============================================================
// STAGE BOARD
// ============================================================
function StageBoard({ stages, cycle }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="panel-header">
        <span className="panel-title">协同编排管线</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          第 {cycle} 轮 · 来自 workflow trace
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {stages.map(stage => (
            <div key={stage.id} style={{ padding: '8px 10px', borderRadius: 6, border: stage.status === 'running' ? `1px solid ${stage.color}88` : stage.status === 'completed' ? `1px solid ${stage.color}55` : '1px solid var(--border-subtle)', background: stage.status === 'running' ? `linear-gradient(135deg,${stage.color}1A,rgba(10,22,40,0.65))` : stage.status === 'completed' ? `linear-gradient(135deg,${stage.color}12,rgba(10,22,40,0.6))` : 'rgba(0,195,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: stage.color, fontSize: 12, fontWeight: 600 }}>{stage.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stage.nameEn}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: stage.status === 'running' ? stage.color : stage.status === 'completed' ? '#7ab8d8' : 'var(--text-muted)', fontWeight: 600 }}>
                  {stage.status === 'running' ? 'RUN' : stage.status === 'completed' ? 'DONE' : 'WAIT'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, minHeight: 28, lineHeight: 1.4 }}>{stage.hint}</div>
              <div style={{ height: 4, borderRadius: 3, background: 'rgba(0,195,255,0.1)', overflow: 'hidden' }}>
                <div style={{ width: `${stage.progress}%`, height: '100%', borderRadius: 3, background: stage.status === 'completed' ? '#39ff6a' : `linear-gradient(90deg,${stage.color},#00ffc8)`, boxShadow: stage.status !== 'pending' ? `0 0 10px ${stage.color}66` : 'none', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AGENT GRID
// ============================================================
function AgentGridPanel({ agents, selectedAgent, onSelect, columns = 2 }) {
  const statusCount = useMemo(() => Object.keys(STATUS_META).reduce((acc, key) => { acc[key] = agents.filter(a => a.status === key).length; return acc; }, {}), [agents]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">多智能体工作台</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10 }}>
          {['running','processing','standby','error'].map(key => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[key].color }} />
              <span style={{ color: 'var(--text-muted)' }}>{statusCount[key]} {STATUS_META[key].label}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`, gap: 8 }}>
          {agents.map(agent => {
            const status = STATUS_META[agent.status] || STATUS_META.standby;
            const selected = selectedAgent === agent.id;
            return (
              <button key={agent.id} onClick={() => onSelect(agent.id)} style={{ textAlign: 'left', border: selected ? `1px solid ${agent.color}99` : `1px solid ${status.border}`, background: selected ? `${agent.color}17` : status.bg, borderRadius: 6, padding: '7px 8px', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.25s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <span style={{ fontSize: 14 }}>{agent.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: agent.color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                    <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{agent.nameEn}</div>
                  </div>
                  <span style={{ fontSize: 8.5, color: status.color, border: `1px solid ${status.border}`, background: status.bg, borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>{status.label}</span>
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', lineHeight: 1.38, marginBottom: 6, minHeight: 24 }}>{agent.currentTask}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 4 }}>
                  {[{label:'CPU',value:`${agent.cpu}%`,warn:agent.cpu>85},{label:'MEM',value:`${agent.memory}%`,warn:agent.memory>85},{label:'Q',value:`${agent.queue}`,warn:agent.queue>80}].map(item => (
                    <div key={item.label} style={{ background: 'rgba(0,195,255,0.05)', borderRadius: 4, padding: '4px 4px' }}>
                      <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{item.label}</div>
                      <div style={{ fontSize: 9.5, color: item.warn ? '#ff9500' : agent.color, fontFamily: 'var(--font-num)', fontWeight: 700 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TOPOLOGY GRAPH
// ============================================================
function TopologyGraph({ agents, selectedAgent }) {
  const option = useMemo(() => {
    const nodes = agents.map(item => ({
      id: item.id, name: item.nameEn, symbolSize: item.id === selectedAgent ? 54 : 42, value: item.queue,
      itemStyle: { color: item.color, borderColor: item.id === selectedAgent ? '#ffffff' : `${item.color}88`, borderWidth: item.id === selectedAgent ? 2.8 : 1.8, shadowColor: item.color, shadowBlur: item.status === 'running' || item.status === 'processing' ? 18 : 8, opacity: item.status === 'standby' ? 0.78 : 1 },
      label: { show: true, color: '#cde8fa', fontSize: 10 },
    }));
    const links = TOPOLOGY_LINKS.map(link => {
      const active = link.source === selectedAgent || link.target === selectedAgent;
      return { ...link, lineStyle: { width: active ? link.weight * 0.45 : link.weight * 0.30, color: active ? 'rgba(0,255,200,0.75)' : 'rgba(0,195,255,0.25)', curveness: 0.14 + (link.weight % 3) * 0.03 }, emphasis: { lineStyle: { color: '#00ffc8', width: link.weight * 0.52 } } };
    });
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(12,26,48,0.95)', borderColor: 'rgba(0,195,255,0.45)', textStyle: { color: '#cde8fa', fontSize: 11 }, formatter: (params) => { if (params.dataType === 'edge') return `链路强度：${params.data.weight}<br/>${params.data.source} → ${params.data.target}`; const found = agents.find(a => a.id === params.data.id); if (!found) return params.data.name; return `${found.name}<br/>角色：${found.role}<br/>队列：${found.queue}<br/>延迟：${found.latency}s`; } },
      series: [{ type: 'graph', layout: 'force', data: nodes, links, roam: true, draggable: true, force: { repulsion: 230, edgeLength: [76, 132], gravity: 0.06 }, edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 8, emphasis: { focus: 'adjacency', lineStyle: { width: 4 } } }],
      animationDurationUpdate: 550,
    };
  }, [agents, selectedAgent]);
  return <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />;
}

// ============================================================
// CONSENSUS PANEL
// ============================================================
function ConsensusPanel({ consensusScore, kpi }) {
  const gaugeOption = useMemo(() => ({
    backgroundColor: 'transparent',
    series: [{ type: 'gauge', min: 0, max: 100, radius: '92%', startAngle: 220, endAngle: -40, pointer: { icon: 'rect', width: 3, length: '56%', itemStyle: { color: '#00ffc8' } }, progress: { show: true, roundCap: true, width: 10 }, axisLine: { lineStyle: { width: 10, color: [[0.7,'#ff6b6b'],[0.85,'#ff9500'],[1,'#39ff6a']] } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { valueAnimation: true, formatter: '{value}%', color: '#00ffc8', fontSize: 22, fontFamily: 'var(--font-num)', offsetCenter: [0,'42%'] }, title: { show: true, offsetCenter: [0,'68%'], color: '#7ab8d8', fontSize: 11 }, data: [{ value: Number(consensusScore.toFixed(1)), name: '协同共识' }] }],
  }), [consensusScore]);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header"><span className="panel-title">共识与 KPI</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, padding: '8px 10px', minHeight: 0, flex: 1 }}>
        <div style={{ minHeight: 140 }}>
          <ReactECharts option={gaugeOption} style={{ width: '100%', height: '100%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, alignContent: 'start' }}>
          {[
            {label:'平均速度',value:`${kpi.speed.toFixed(1)} mph`,color:'#00c3ff'},
            {label:'拥堵占比',value:`${kpi.congestion.toFixed(1)}%`,color:'#ff9500'},
            {label:'平均延误',value:`${kpi.delay.toFixed(1)} min`,color:'#ff6b6b'},
            {label:'通行效率',value:`${kpi.throughput.toFixed(1)}`,color:'#39ff6a'},
            {label:'目标提速',value:`${kpi.targetSpeedGain}%`,color:'#00ffc8'},
            {label:'目标降拥堵',value:`${kpi.targetCongestionDrop}%`,color:'#ffd700'},
          ].map(item => (
            <div key={item.label} style={{ border: `1px solid ${item.color}55`, background: `${item.color}10`, borderRadius: 6, padding: '8px 9px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</div>
              <div style={{ fontSize: 14, color: item.color, fontFamily: 'var(--font-num)', fontWeight: 700, marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AGENT RADAR PANEL
// ============================================================
function AgentRadarPanel({ agent }) {
  const option = useMemo(() => {
    if (!agent) return null;
    const values = [
      clamp(35 + agent.completed * 2.8, 40, 100),
      clamp(100 - Math.abs(agent.cpu - 58) * 1.15 - (agent.status === 'error' ? 16 : 0), 42, 100),
      clamp(agent.collaboration, 40, 100),
      clamp(100 - agent.latency * 7.2, 28, 100),
      clamp(112 - (agent.cpu * 0.55 + agent.memory * 0.35 + agent.queue * 0.12), 22, 100),
    ].map(v => Number(v.toFixed(1)));
    return {
      backgroundColor: 'transparent',
      radar: { indicator: [{name:'执行力',max:100},{name:'稳定性',max:100},{name:'协作度',max:100},{name:'实时性',max:100},{name:'资源效率',max:100}], center: ['50%','56%'], radius: '66%', splitNumber: 4, axisName: { color: 'rgba(200,230,250,0.72)', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(0,195,255,0.12)' } }, splitArea: { areaStyle: { color: ['rgba(0,195,255,0.02)','rgba(0,195,255,0.05)'] } }, axisLine: { lineStyle: { color: 'rgba(0,195,255,0.25)' } } },
      series: [{ type: 'radar', data: [{ value: values, name: agent.name, lineStyle: { color: agent.color, width: 2.4 }, areaStyle: { color: `${agent.color}2A` }, itemStyle: { color: agent.color } }] }],
      tooltip: { trigger: 'item', backgroundColor: 'rgba(12,26,48,0.95)', borderColor: 'rgba(0,195,255,0.45)', textStyle: { color: '#cde8fa', fontSize: 11 } },
    };
  }, [agent]);
  if (!agent) return null;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">选中 Agent 画像</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: agent.color }}>{agent.icon} {agent.nameEn}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactECharts option={option} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

// ============================================================
// EVENT TIMELINE
// ============================================================
function EventTimelinePanel({ events }) {
  const levelStyle = { info: '#00c3ff', success: '#39ff6a', warn: '#ff9500', error: '#ff3b3b' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">协同事件流</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>最近 {events.length} 条</span>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {events.slice(0, 12).map((event, index) => (
          <div key={`${event.id}-${index}`} style={{ display: 'grid', gridTemplateColumns: '68px 82px 1fr', gap: 8, borderRadius: 5, borderLeft: `2px solid ${levelStyle[event.level] || '#00c3ff'}`, background: index < 3 ? `${levelStyle[event.level] || '#00c3ff'}10` : 'transparent', padding: '4px 8px', marginBottom: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{event.time}</span>
            <span style={{ color: levelStyle[event.level] || '#00c3ff', fontWeight: 700 }}>{event.source}</span>
            <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>[{event.stage}] {event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// WORKBENCH PANEL
// ============================================================
function WorkbenchPanel({
  state,
  scenario,
  onScenarioChange,
  onRunBackend,
  onRunStream,
  missionHistory,
  onClearBackend,
  onLoadMission,
  onRefreshOverview,
  onRefreshHistory,
}) {
  const backend = state.backend;
  const workflow = backend.result?.workflow_state || {};
  const workflowActions = Array.isArray(workflow.agent_actions) ? workflow.agent_actions : [];
  const summary = workflow.executive_summary || backend.result?.llm_enhanced_report || '';
  const overview = backend.overview?.summary || {};
  const capabilities = backend.overview?.capabilities || [];
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="panel-header">
        <span className="panel-title">协同指挥台</span>
        {backend.result && onClearBackend && (
          <button type="button" onClick={onClearBackend} title="清除当前选中的后端结果"
            style={{ marginLeft: 8, fontSize: 9, color: 'var(--text-muted)', background: 'transparent', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>
            清除结果
          </button>
        )}
        <button onClick={() => setShowHistory(v => !v)} style={{ marginLeft: 'auto', fontSize: 9, color: showHistory ? '#00ffc8' : 'var(--text-muted)', background: 'transparent', border: `1px solid ${showHistory ? 'rgba(0,255,200,0.4)' : 'rgba(0,195,255,0.2)'}`, borderRadius: 10, padding: '2px 8px', cursor: 'pointer' }}>
          历史 {missionHistory.length > 0 ? `(${missionHistory.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => {
            onRefreshOverview?.();
            onRefreshHistory?.();
          }}
          style={{ marginLeft: 8, fontSize: 9, color: '#7ab8d8', background: 'transparent', border: '1px solid rgba(0,195,255,0.2)', borderRadius: 10, padding: '2px 8px', cursor: 'pointer' }}
        >
          刷新
        </button>
      </div>

      {showHistory ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px' }}>
          {missionHistory.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>暂无历史任务，请先调用后端运行</div>
          ) : missionHistory.map((m, i) => (
            <button
              type="button"
              key={m.mission_id}
              onClick={() => onLoadMission?.(m.mission_id)}
              style={{ width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: 6, background: workflow.mission_id === m.mission_id ? 'rgba(0,255,200,0.08)' : i === 0 ? 'rgba(0,255,200,0.04)' : 'rgba(0,195,255,0.04)', border: `1px solid ${workflow.mission_id === m.mission_id ? 'rgba(0,255,200,0.35)' : i === 0 ? 'rgba(0,255,200,0.18)' : 'rgba(0,195,255,0.12)'}`, borderRadius: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.mission_id?.slice(0, 18)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: Number(m.consensus_score) > 85 ? '#39ff6a' : '#ff9500', fontWeight: 700 }}>{Number(m.consensus_score || 0).toFixed(1)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.scenario}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.dataset}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>风险 {m.risk_count || 0}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>提速 {Number(m.speed_gain_pct || 0).toFixed(1)}%</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.created_at?.slice(0, 16)?.replace('T', ' ')}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <button onClick={onRunBackend} disabled={backend.loading} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(0,195,255,0.55)', background: backend.loading ? 'rgba(0,195,255,0.08)' : 'rgba(0,195,255,0.16)', color: backend.loading ? 'var(--text-muted)' : '#00c3ff', cursor: backend.loading ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 600 }}>
                {backend.loading && !backend.streaming ? '执行中...' : '后端协同'}
              </button>
              <button onClick={onRunStream} disabled={backend.loading} title="通过 SSE 流式接口实时观察各节点执行进度"
                style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(0,255,200,0.5)', background: backend.streaming ? 'rgba(0,255,200,0.18)' : backend.loading ? 'rgba(0,255,200,0.06)' : 'rgba(0,255,200,0.12)', color: backend.streaming ? '#00ffc8' : backend.loading ? 'var(--text-muted)' : '#00ffc8', cursor: backend.loading ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 600 }}>
                {backend.streaming ? '⚡ 流式中...' : '⚡ 流式运行'}
              </button>
            </div>
            {/* SSE streaming node progress */}
            {backend.streaming && (backend.streamNodes || []).length > 0 && (
              <div style={{ padding: '4px 0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(backend.streamNodes || []).map(n => (
                  <span key={n.node} style={{ fontSize: 9, color: n.color, background: `${n.color}15`, border: `1px solid ${n.color}40`, borderRadius: 10, padding: '1px 7px' }}>
                    ✓ {n.label} {formatDurationMs(n.durationMs)}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 4 }}>
              {SCENARIOS.map(item => (
                <button key={item.id} onClick={() => onScenarioChange(item.id)} style={{ textAlign: 'left', border: item.id === state.scenarioId ? '1px solid rgba(0,255,200,0.55)' : '1px solid rgba(0,195,255,0.2)', background: item.id === state.scenarioId ? 'linear-gradient(135deg,rgba(0,255,200,0.12),rgba(0,195,255,0.08))' : 'rgba(0,195,255,0.04)', borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>
                  <div style={{ fontSize: 9.5, color: item.id === state.scenarioId ? '#00ffc8' : '#7ab8d8', fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginTop: 1 }}>{item.dataset}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
              <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(0,195,255,0.05)', border: '1px solid rgba(0,195,255,0.12)' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>历史任务</div>
                <div style={{ fontSize: 12, color: '#00c3ff', fontWeight: 700 }}>{overview.total_missions ?? missionHistory.length}</div>
              </div>
              <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(0,255,200,0.05)', border: '1px solid rgba(0,255,200,0.12)' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>平均共识</div>
                <div style={{ fontSize: 12, color: '#00ffc8', fontWeight: 700 }}>{overview.avg_consensus_score != null ? Number(overview.avg_consensus_score).toFixed(1) : '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {capabilities.map(item => (
                <span key={item.id} style={{ fontSize: 9, padding: '3px 7px', borderRadius: 10, border: `1px solid ${item.available ? 'rgba(0,255,200,0.22)' : 'rgba(255,149,0,0.22)'}`, background: item.available ? 'rgba(0,255,200,0.06)' : 'rgba(255,149,0,0.06)', color: item.available ? '#00ffc8' : '#ff9500' }}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backend.error && <div style={{ border: '1px solid rgba(255,59,59,0.45)', background: 'rgba(255,59,59,0.10)', borderRadius: 6, padding: '8px 10px', color: '#ff6b6b', fontSize: 11, lineHeight: 1.5 }}>{backend.error}</div>}
            {!backend.result && !backend.loading && !backend.error && (
              <div style={{ border: '1px dashed rgba(0,195,255,0.35)', background: 'rgba(0,195,255,0.04)', borderRadius: 6, padding: '10px 11px', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.6 }}>
                点击“后端协同”或“⚡ 流式运行”，调用真实工作流。当前页面只保留运行、历史回看、HITL、对话和知识检索，不再展示纯演示控制项。
              </div>
            )}
            {backend.result && (
              <>
                <div style={{ border: '1px solid rgba(0,255,200,0.35)', background: 'rgba(0,255,200,0.08)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#00ffc8', fontWeight: 700 }}>后端任务已完成</span>
                    {workflow.mission_id && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{workflow.mission_id}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.55, maxHeight: 220, overflow: 'auto' }}>
                    {summary ? <MarkdownContent>{summary}</MarkdownContent> : '后端执行完成。'}
                  </div>
                </div>
                <div style={{ border: '1px solid rgba(0,195,255,0.12)', background: 'rgba(0,195,255,0.04)', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  <div style={{ color: '#00c3ff', fontWeight: 700, marginBottom: 4 }}>当前任务概览</div>
                  <div>共识评分 {Number(state.consensusScore || 0).toFixed(1)} / 风险 {state.hitl.allRisks?.length || 0} / 更新时间 {backend.updatedAt?.slice(11, 19) || '—'}</div>
                  <div style={{ marginTop: 4 }}>命中接口：`POST /agents/run`、`POST /agents/run/stream`、`GET /agents/missions`、`GET /agents/missions/{'{id}'}`、`POST /agents/hitl/{'{id}'}/apply`</div>
                </div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 8px', fontSize: 10, color: '#00c3ff', borderBottom: '1px solid var(--border-subtle)' }}>动作清单 (共 {workflowActions.length})</div>
                  <div style={{ maxHeight: 120, overflow: 'auto' }}>
                    {workflowActions.slice(0, 8).map((item, i) => (
                      <div key={`${item.agent}-${i}`} style={{ padding: '5px 8px', borderBottom: i < Math.min(workflowActions.length, 8) - 1 ? '1px solid rgba(0,195,255,0.08)' : 'none' }}>
                        <div style={{ fontSize: 9.5, color: '#7ab8d8' }}>{item.agent}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-primary)', lineHeight: 1.45 }}>{item.detail || item.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// EXECUTION TRACE (TAB 1)
// ============================================================
function TracePanel({ trace, stages, agents, events, onSelectNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const entries = trace.entries;
  if (!entries.length) return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>暂无执行轨迹数据</div>;

  const minTs = Math.min(...entries.map(e => e.startMs));
  const maxTs = Math.max(...entries.map(e => e.startMs + e.durationMs));
  const totalDur = Math.max(maxTs - minTs, 0.001);

  const selected = selectedNodeId ? entries.find(e => e.node === selectedNodeId) : null;
  const selectedStageAgent = selectedNodeId ? agents.find(a => selectedNodeId.includes(a.id)) : null;

  function pct(ms) { return ((ms - minTs) / totalDur * 100).toFixed(2); }
  function durPct(d) {
    if (d <= 0) return '0.40';
    return Math.max((d / totalDur) * 100, 0.8).toFixed(2);
  }

  const STATUS_COLOR = { completed: '#39ff6a', running: '#ff9500', pending: '#4a7a99', error: '#ff3b3b' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 8, height: '100%', overflow: 'hidden' }}>
        {/* Gantt */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">执行甘特图</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>总耗时 {((maxTs - minTs) / 1000).toFixed(1)}s</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
            {/* Time axis */}
            <div style={{ display: 'flex', marginLeft: 108, marginBottom: 6, position: 'relative', height: 20 }}>
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <div key={t} style={{ position: 'absolute', left: `${t * 100}%`, fontSize: 9, color: 'var(--text-muted)', transform: 'translateX(-50%)' }}>
                  {formatDurationMs(totalDur * t)}
                </div>
              ))}
              <div style={{ position: 'absolute', inset: '10px 0 0 0', height: 1, background: 'rgba(0,195,255,0.1)' }} />
            </div>
            {/* Bars */}
            {entries.map(entry => {
              const isSelected = selectedNodeId === entry.node;
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}
                  onClick={() => { setSelectedNodeId(isSelected ? null : entry.node); onSelectNode(isSelected ? null : entry.node); }}>
                  <div style={{ width: 100, fontSize: 10, color: isSelected ? entry.color : 'var(--text-secondary)', fontWeight: isSelected ? 700 : 400, flexShrink: 0, paddingRight: 8, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</div>
                  <div style={{ flex: 1, height: 22, position: 'relative', background: 'rgba(0,195,255,0.04)', borderRadius: 4, border: '1px solid rgba(0,195,255,0.08)' }}>
                    <div style={{ position: 'absolute', left: `${pct(entry.startMs)}%`, width: `${durPct(entry.durationMs)}%`, top: 2, bottom: 2, background: `${entry.color}${entry.status === 'running' ? 'cc' : '66'}`, borderRadius: 3, border: `1px solid ${entry.color}88`, boxShadow: entry.status === 'running' ? `0 0 8px ${entry.color}66` : 'none', transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                      {entry.durationMs > totalDur * 0.08 && <span style={{ fontSize: 9, color: '#fff', fontFamily: 'var(--font-mono)' }}>{formatDurationMs(entry.durationMs)}</span>}
                    </div>
                    {entry.status === 'running' && (
                      <div style={{ position: 'absolute', left: `${pct(entry.startMs + entry.durationMs)}%`, top: 0, bottom: 0, width: 2, background: entry.color, borderRadius: 1, animation: 'breathe 0.8s ease-in-out infinite' }} />
                    )}
                  </div>
                  <div style={{ width: 56, fontSize: 9, color: STATUS_COLOR[entry.status], textAlign: 'right', paddingLeft: 6, flexShrink: 0 }}>
                    {entry.status === 'completed' ? `✓ ${(entry.durationMs/1000).toFixed(2)}s` : entry.status === 'running' ? '运行中' : '等待'}
                  </div>
                </div>
              );
            })}

            {/* Grid lines */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {[0.25, 0.5, 0.75].map(t => (
                <div key={t} style={{ position: 'absolute', left: `calc(108px + ${t * (100)}%)`, top: 0, bottom: 0, width: 1, background: 'rgba(0,195,255,0.06)' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Node detail */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-header"><span className="panel-title">节点详情</span></div>
          {selected ? (
            <div style={{ padding: '10px', overflow: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{LG_NODES.find(n => n.id === selected.node)?.icon || '⚙️'}</span>
                <div>
                  <div style={{ fontSize: 13, color: selected.color, fontWeight: 700 }}>{selected.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selected.node}</div>
                </div>
              </div>
              {[
                { label: '状态', value: selected.status === 'completed' ? '✓ 已完成' : selected.status === 'running' ? '⚡ 运行中' : '⏳ 等待', color: STATUS_COLOR[selected.status] },
                { label: '开始时间', value: new Date(selected.startMs).toLocaleTimeString() },
                { label: '执行耗时', value: `${(selected.durationMs / 1000).toFixed(3)} s` },
                { label: '节点类型', value: LG_NODES.find(n => n.id === selected.node)?.stageId || 'terminal' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(0,195,255,0.08)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: row.color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{row.value}</span>
                </div>
              ))}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>执行时间分布</div>
                <div style={{ height: 4, background: 'rgba(0,195,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${Math.min(100, selected.durationMs / totalDur * 100 * 3)}%`, height: '100%', background: `linear-gradient(90deg,${selected.color},#00ffc8)`, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  占总运行时间 {((selected.durationMs / totalDur) * 100).toFixed(1)}%
                </div>
              </div>

              {selectedStageAgent && (
                <div style={{ marginTop: 12, padding: '8px', background: 'rgba(0,195,255,0.05)', borderRadius: 6, border: '1px solid rgba(0,195,255,0.15)' }}>
                  <div style={{ fontSize: 10, color: '#00c3ff', marginBottom: 4 }}>关联 Agent</div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>{selectedStageAgent.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{selectedStageAgent.role}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ fontSize: 24, opacity: 0.3 }}>⏱</div>
              <div>点击左侧节点查看详情</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8, flexShrink: 0 }}>
        {[
          { label: '已完成节点', value: entries.filter(e => e.status === 'completed').length, total: entries.length, color: '#39ff6a' },
          { label: '运行中节点', value: entries.filter(e => e.status === 'running').length, total: entries.length, color: '#ff9500' },
          { label: '平均耗时', value: `${(entries.reduce((a,e) => a + e.durationMs, 0) / entries.length / 1000).toFixed(2)}s`, color: '#00c3ff' },
          { label: '总执行时间', value: `${(totalDur / 1000).toFixed(2)}s`, color: '#00ffc8' },
        ].map(stat => (
          <div key={stat.label} className="panel" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stat.label}</div>
            <div style={{ fontSize: 18, color: stat.color, fontFamily: 'var(--font-num)', fontWeight: 700 }}>
              {stat.value}{stat.total ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> / {stat.total}</span> : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// HITL PANEL (TAB 2)
// ============================================================
function HITLPanel({ hitl, backendResult, onDecide, onApply, applyLoading }) {
  const [expandedRisk, setExpandedRisk] = useState(null);
  const [reasonInputs, setReasonInputs] = useState({});
  const missionId = backendResult?.workflow_state?.mission_id;

  const workflow = backendResult?.workflow_state || {};
  const risks = workflow.risk_register || hitl.pendingRisks || [];
  const allDecisions = hitl.decisions;

  const RISK_LEVEL_META = {
    high:   { label: '高风险', color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)',  icon: '🔴' },
    medium: { label: '中风险', color: '#ff9500', bg: 'rgba(255,149,0,0.10)', icon: '🟡' },
    low:    { label: '低风险', color: '#39ff6a', bg: 'rgba(57,255,106,0.08)', icon: '🟢' },
  };

  const ACTION_META = {
    approve: { label: '批准执行', color: '#39ff6a', bg: 'rgba(57,255,106,0.15)', border: 'rgba(57,255,106,0.4)' },
    reject:  { label: '驳回修订', color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)', border: 'rgba(255,59,59,0.4)' },
    modify:  { label: '标注待改', color: '#ff9500', bg: 'rgba(255,149,0,0.12)', border: 'rgba(255,149,0,0.4)' },
  };

  const stats = {
    total: risks.length,
    approved: allDecisions.filter(d => d.action === 'approve').length,
    rejected: allDecisions.filter(d => d.action === 'reject').length,
    pending: risks.length - allDecisions.filter(d => risks.some(r => r.id === d.riskId)).length,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        {[
          { label: '风险总数', value: stats.total, color: '#00c3ff' },
          { label: '待审批', value: stats.pending, color: '#ff9500' },
          { label: '已批准', value: stats.approved, color: '#39ff6a' },
          { label: '已驳回', value: stats.rejected, color: '#ff3b3b' },
        ].map(s => (
          <div key={s.label} className="panel" style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
            <div style={{ fontSize: 22, color: s.color, fontFamily: 'var(--font-num)', fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 8, flex: 1, overflow: 'hidden' }}>
        {/* Risk Cards */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">风险登记册</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ff9500' }}>需要人工审批</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, color: '#39ff6a', fontWeight: 600 }}>暂无风险记录</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  请先在"协同编排"页调用后端协同，系统将自动识别风险并填充此列表
                </div>
              </div>
            ) : risks.map(risk => {
              const meta = RISK_LEVEL_META[risk.level] || RISK_LEVEL_META.medium;
              const decision = allDecisions.find(d => d.riskId === risk.id);
              const isExpanded = expandedRisk === risk.id;
              const decisionMeta = decision ? ACTION_META[decision.action] : null;

              return (
                <div key={risk.id} style={{ border: `1px solid ${decision ? ACTION_META[decision.action].border : meta.color + '44'}`, background: decision ? `${ACTION_META[decision.action].bg}` : meta.bg, borderRadius: 8, overflow: 'hidden', transition: 'all 0.3s ease' }}>
                  {/* Risk header */}
                  <div style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                    onClick={() => setExpandedRisk(isExpanded ? null : risk.id)}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: meta.color, border: `1px solid ${meta.color}55`, background: `${meta.color}15`, borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>{risk.id} · {meta.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>责任方: {risk.owner}</span>
                        {decision && <span style={{ fontSize: 10, color: decisionMeta.color, border: `1px solid ${decisionMeta.border}`, background: decisionMeta.bg, borderRadius: 10, padding: '1px 8px', marginLeft: 'auto', fontWeight: 600 }}>✓ {decisionMeta.label}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>{risk.item}</div>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${meta.color}22` }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10, marginTop: 8 }}>
                        <span style={{ color: '#00c3ff', fontWeight: 600 }}>缓解策略：</span>{risk.mitigation}
                      </div>
                      {!decision && (
                        <>
                          <div style={{ marginBottom: 8 }}>
                            <input
                              placeholder="添加审批备注（可选）"
                              value={reasonInputs[risk.id] || ''}
                              onChange={e => setReasonInputs(prev => ({...prev, [risk.id]: e.target.value}))}
                              className="chat-input"
                              style={{ width: '100%', fontSize: 11, padding: '6px 10px' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {['approve', 'reject', 'modify'].map(act => {
                              const am = ACTION_META[act];
                              return (
                                <button key={act} onClick={() => { onDecide({ riskId: risk.id, action: act, reason: reasonInputs[risk.id] || '' }); setExpandedRisk(null); }}
                                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${am.border}`, background: am.bg, color: am.color, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.2s', letterSpacing: '0.03em' }}>
                                  {am.label}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {decision && (
                        <div style={{ background: `${decisionMeta.bg}`, border: `1px solid ${decisionMeta.border}`, borderRadius: 6, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 14 }}>{decision.action === 'approve' ? '✅' : decision.action === 'reject' ? '❌' : '✏️'}</span>
                          <div>
                            <div style={{ fontSize: 11, color: decisionMeta.color, fontWeight: 600 }}>{decisionMeta.label} · {decision.ts}</div>
                            {decision.reason && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{decision.reason}</div>}
                          </div>
                          <button onClick={() => onDecide({ riskId: risk.id, action: null })} style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', background: 'transparent', border: '1px solid rgba(0,195,255,0.2)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>撤销</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Decision History */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">审批历史</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{allDecisions.length} 条</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
            {allDecisions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11 }}>暂无审批记录</div>
            ) : allDecisions.map((d, i) => {
              const meta = ACTION_META[d.action];
              const risk = risks.find(r => r.id === d.riskId);
              return (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,195,255,0.07)', display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{d.action === 'approve' ? '✅' : d.action === 'reject' ? '❌' : '✏️'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: meta?.color, fontWeight: 600 }}>{meta?.label}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{d.ts}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.riskId}: {risk?.item || '风险项'}
                    </div>
                    {d.reason && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>备注: {d.reason}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Apply + HITL Principles */}
          <div style={{ padding: '10px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,195,255,0.03)' }}>
            {missionId && allDecisions.length > 0 && (
              <button onClick={onApply} disabled={applyLoading}
                style={{ width: '100%', padding: '8px', marginBottom: 8, borderRadius: 6, border: '1px solid rgba(0,255,200,0.5)', background: applyLoading ? 'rgba(0,255,200,0.06)' : 'rgba(0,255,200,0.14)', color: applyLoading ? 'var(--text-muted)' : '#00ffc8', cursor: applyLoading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700 }}>
                {applyLoading ? '重跑中...' : `🔄 携带 ${allDecisions.length} 条决策重新运行`}
              </button>
            )}
            <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, marginBottom: 6 }}>Human-in-the-Loop 规范</div>
            {[
              '高风险操作必须人工批准后才可执行',
              '驳回的策略将触发 refine_agent 回环修订',
              '审批决策持久化到后端数据库（SQLite）',
              '点击"重新运行"可将决策注入 Planner 契约',
            ].map((p, i) => (
              <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 8, borderLeft: '2px solid rgba(0,195,255,0.2)', marginBottom: 4 }}>{p}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CHAT PANEL (TAB 3)
// ============================================================
function ChatPanel({ chatState, scenario, consensusScore, backendResult, dispatch }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatState.messages]);

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || chatState.streaming) return;
    setInput('');

    dispatch({ type: 'CHAT_ADD_USER', content });
    dispatch({ type: 'CHAT_START_ASSISTANT' });

    const history = chatState.messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
    const workflow = backendResult?.workflow_state || {};
    const riskText = Array.isArray(workflow.risk_register) && workflow.risk_register.length
      ? workflow.risk_register.slice(0, 3).map(r => `[${r.level}] ${r.item}`).join('；')
      : '无';
    const summaryText = workflow.executive_summary || backendResult?.llm_enhanced_report || '暂无后端执行摘要';
    const contextInfo = [
      `当前场景: ${scenario.title}`,
      `共识评分: ${consensusScore.toFixed(1)}`,
      `数据集: ${scenario.dataset}`,
      `任务ID: ${workflow.mission_id || '未运行'}`,
      `执行摘要: ${summaryText}`,
      `风险摘要: ${riskText}`,
    ].join('；');

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`${BACKEND_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({ message: content + '\n\n[系统上下文参考]' + contextInfo, history, use_external_context: false }),
      });
      if (!res.ok) throw new Error(`${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { dispatch({ type: 'CHAT_DONE' }); return; }
          try {
            const obj = JSON.parse(data);
            if (obj.token) dispatch({ type: 'CHAT_APPEND_TOKEN', token: obj.token });
            if (obj.error) { dispatch({ type: 'CHAT_ERROR', error: obj.error }); return; }
          } catch { /* non-json line */ }
        }
      }
      dispatch({ type: 'CHAT_DONE' });
    } catch (err) {
      if (err.name === 'AbortError') { dispatch({ type: 'CHAT_DONE' }); return; }
      dispatch({ type: 'CHAT_ERROR', error: err.message || '连接失败' });
    }
  }, [input, chatState, scenario, consensusScore, dispatch]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const [ragResults, setRagResults] = useState([]);
  const [ragQuery, setRagQuery] = useState('');
  const [ragLoading, setRagLoading] = useState(false);

  const searchRag = useCallback(async (q) => {
    const query = (q || ragQuery).trim();
    if (!query) return;
    setRagLoading(true);
    setRagQuery(query);
    try {
      const res = await fetch(`${BACKEND_URL}/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 4 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRagResults(data.results || []);
      }
    } catch {}
    setRagLoading(false);
  }, [ragQuery]);

  // 初始化时加载知识条目列表
  const [ragItems, setRagItems] = useState([]);
  useEffect(() => {
    fetch(`${BACKEND_URL}/rag/items`)
      .then(r => r.json())
      .then(d => setRagItems(d.items || []))
      .catch(() => {});
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', gap: 8, overflow: 'hidden' }}>
      {/* Chat area */}
      <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel-header">
          <span className="panel-title">💬 智能对话助手</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
            <span style={{ color: chatState.streaming ? '#ff9500' : '#39ff6a' }}>
              {chatState.streaming ? '⚡ 推理中...' : '● 就绪'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>/ chat / stream · SSE</span>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto' }}>
          {chatState.messages.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🧠</div>
              <div style={{ fontSize: 13, color: '#00c3ff', fontWeight: 600, marginBottom: 4 }}>交通智能决策助手</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 300, margin: '0 auto' }}>
                基于 DCRNN 预测模型和 LangGraph 多智能体系统<br />可询问交通预测、拥堵分析和 Agent 决策
              </div>
            </div>
          )}
          {chatState.messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,195,255,0.2)', border: '1px solid rgba(0,195,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🧠</div>
              )}
              <div className={`chat-bubble ${msg.role === 'assistant' ? 'chat-bubble-md' : ''}`} style={{ lineHeight: 1.7 }}>
                {msg.role === 'assistant' ? (
                  <>
                    <MarkdownContent>{msg.content}</MarkdownContent>
                    {chatState.streaming && msg === chatState.messages[chatState.messages.length - 1] && (
                      <span className="streaming-cursor" style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
                    )}
                  </>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
              {msg.role === 'user' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(57,255,106,0.15)', border: '1px solid rgba(57,255,106,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>👤</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(0,195,255,0.02)' }}>
          {CHAT_SUGGESTIONS.slice(0, 3).map(s => (
            <button key={s} onClick={() => sendMessage(s)} disabled={chatState.streaming}
              style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'rgba(0,195,255,0.06)', border: '1px solid rgba(0,195,255,0.15)', borderRadius: 12, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题... (Enter 发送)"
            disabled={chatState.streaming}
          />
          {chatState.streaming ? (
            <button onClick={() => { abortRef.current?.abort(); dispatch({ type: 'CHAT_DONE' }); }}
              style={{ padding: '7px 14px', borderRadius: 5, border: '1px solid rgba(255,59,59,0.4)', background: 'rgba(255,59,59,0.1)', color: '#ff3b3b', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              停止
            </button>
          ) : (
            <button onClick={() => sendMessage()} disabled={!input.trim()}
              style={{ padding: '7px 16px', borderRadius: 5, border: '1px solid rgba(0,195,255,0.5)', background: input.trim() ? 'rgba(0,195,255,0.2)' : 'rgba(0,195,255,0.06)', color: input.trim() ? '#00c3ff' : 'var(--text-muted)', cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600, transition: 'all 0.2s' }}>
              发送
            </button>
          )}
        </div>
      </div>

      {/* Right panel: RAG Knowledge + Context */}
      <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
          <div className="panel-header">
            <span className="panel-title">📚 知识检索 (RAG)</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>POST /rag/search</span>
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 4 }}>
            <input
              value={ragQuery}
              onChange={e => setRagQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchRag()}
              placeholder="搜索知识库..."
              className="chat-input"
              style={{ flex: 1, fontSize: 10, padding: '4px 8px' }}
            />
            <button onClick={() => searchRag()} disabled={ragLoading}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(0,195,255,0.4)', background: 'rgba(0,195,255,0.1)', color: '#00c3ff', cursor: 'pointer', fontSize: 10 }}>
              {ragLoading ? '...' : '🔍'}
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ragResults.length > 0 ? ragResults.map((item, i) => (
              <div key={i} style={{ padding: '7px 9px', background: 'rgba(0,255,200,0.05)', border: '1px solid rgba(0,255,200,0.15)', borderRadius: 6, cursor: 'pointer' }}
                onClick={() => sendMessage(`关于"${item.title}"：${item.snippet || ''}`)}>
                <div style={{ fontSize: 10, color: '#00ffc8', fontWeight: 600, marginBottom: 3 }}>📄 {item.title}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.category}</div>
                {item.snippet && <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: item.snippet.replace(/<em>/g, '<span style="color:#00ffc8">').replace(/<\/em>/g, '</span>') }} />}
              </div>
            )) : (
              ragItems.slice(0, 8).map((item, i) => (
                <div key={i} style={{ padding: '6px 9px', background: 'rgba(0,195,255,0.04)', border: '1px solid rgba(0,195,255,0.12)', borderRadius: 6, cursor: 'pointer' }}
                  onClick={() => { setRagQuery(item.title); searchRag(item.title); }}>
                  <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{item.category}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel" style={{ flexShrink: 0 }}>
          <div className="panel-header"><span className="panel-title">当前上下文</span></div>
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: '场景', value: scenario.title.slice(0, 10) + '...', color: '#00c3ff' },
              { label: '数据集', value: scenario.dataset, color: '#7ab8d8' },
              { label: '共识评分', value: `${consensusScore.toFixed(1)}%`, color: consensusScore > 85 ? '#39ff6a' : '#ff9500' },
              { label: '接入端点', value: '/chat/stream', color: 'var(--text-muted)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontSize: 10, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ flexShrink: 0 }}>
          <div className="panel-header"><span className="panel-title">更多建议问题</span></div>
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CHAT_SUGGESTIONS.slice(3).map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                style={{ textAlign: 'left', fontSize: 10, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 0', lineHeight: 1.5 }}>
                › {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// INNER TAB NAVIGATION
// ============================================================
function InnerTabNav({ activeTab, onTabChange, hitlPendingCount, wsConnected }) {
  return (
    <div style={{ display: 'flex', gap: 0, background: 'rgba(0,10,24,0.6)', borderRadius: '8px 8px 0 0', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(0,195,255,0.15)', borderBottom: 'none', marginTop: 8 }}>
      {INNER_TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', background: isActive ? 'rgba(0,195,255,0.12)' : 'transparent', border: 'none', borderRight: tab.id < INNER_TABS.length - 1 ? '1px solid rgba(0,195,255,0.1)' : 'none', borderBottom: isActive ? '2px solid #00c3ff' : '2px solid transparent', color: isActive ? '#00c3ff' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 400, transition: 'all 0.2s ease', position: 'relative', letterSpacing: '0.03em', fontFamily: 'var(--font-sans)' }}>
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 2 && hitlPendingCount > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderRadius: '50%', background: '#ff9500', color: '#000', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{hitlPendingCount}</span>
            )}
            <span style={{ fontSize: 9, color: isActive ? 'rgba(0,195,255,0.6)' : 'rgba(0,0,0,0)', position: 'absolute', bottom: -1, left: 0, right: 0, textAlign: 'center' }}>█</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// MISSION KPI BAR
// ============================================================
function MissionBar({ state, scenario, overview }) {
  const ws = state.ws;
  const summary = overview?.summary || {};
  const currentMissionId = state.backend.result?.workflow_state?.mission_id;
  return (
    <div className="panel" style={{ flexShrink: 0, padding: '0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 42 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00c3ff', letterSpacing: '0.05em' }}>
              Agent 指挥台
            </div>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(0,255,200,0.45)', background: 'rgba(0,255,200,0.1)', color: '#00ffc8' }}>
              真实接口页
            </span>
            {currentMissionId && (
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(0,195,255,0.3)', background: 'rgba(0,195,255,0.08)', color: '#7ab8d8', fontFamily: 'var(--font-mono)' }}>
                {currentMissionId.slice(0, 14)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            RUN · STREAM · HISTORY · HITL · CHAT · RAG
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: 'var(--border-subtle)' }} />

        <div style={{ background: 'rgba(0,195,255,0.08)', border: '1px solid rgba(0,195,255,0.2)', borderRadius: 5, padding: '4px 10px' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>当前场景</div>
          <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenario.title}</div>
        </div>

        {[
          { label: '历史任务', value: summary.total_missions ?? state.missionHistory.length, color: '#7ab8d8' },
          { label: '平均共识', value: summary.avg_consensus_score != null ? `${Number(summary.avg_consensus_score).toFixed(1)}%` : '—', color: '#39ff6a' },
          { label: '风险任务', value: summary.missions_with_risk ?? '—', color: '#ff9500' },
        ].map(item => (
          <div key={item.label} style={{ background: `${item.color}12`, border: `1px solid ${item.color}30`, borderRadius: 5, padding: '4px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.label}</div>
            <div style={{ fontSize: 12, color: item.color, fontFamily: 'var(--font-num)', fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {[
          { label: '均速', value: `${state.kpi.speed.toFixed(1)}`, unit: 'mph', color: '#00c3ff' },
          { label: '拥堵', value: `${state.kpi.congestion.toFixed(1)}`, unit: '%', color: state.kpi.congestion > 40 ? '#ff3b3b' : '#ff9500' },
          { label: 'LLM', value: summary.llm_ready ? 'READY' : 'OFF', unit: '', color: summary.llm_ready ? '#00ffc8' : '#7ab8d8' },
          { label: 'RAG', value: summary.rag_db_ready ? 'READY' : 'WAIT', unit: '', color: summary.rag_db_ready ? '#39ff6a' : '#ff9500' },
          { label: '延误', value: `${state.kpi.delay.toFixed(1)}`, unit: 'min', color: '#7ab8d8' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.label}</span>
            <span style={{ fontSize: 14, color: item.color, fontFamily: 'var(--font-num)', fontWeight: 700 }}>{item.value}</span>
            {item.unit && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.unit}</span>}
          </div>
        ))}

        <div style={{ width: 1, height: 32, background: 'var(--border-subtle)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: ws.connected ? 'rgba(57,255,106,0.06)' : 'rgba(255,149,0,0.06)', border: `1px solid ${ws.connected ? 'rgba(57,255,106,0.25)' : 'rgba(255,149,0,0.25)'}`, borderRadius: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ws.connected ? '#39ff6a' : '#ff9500', boxShadow: `0 0 6px ${ws.connected ? '#39ff6a' : '#ff9500'}`, animation: 'breathe 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, color: ws.connected ? '#39ff6a' : '#ff9500' }}>
            WS {ws.connected ? '在线' : ws.reconnecting ? '重连中' : '离线'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 协同产出（后端 workflow_state 可读化）
// ============================================================
function CoordinationOutputPanel({
  workflow,
  backendLoading,
  backendStreaming,
  hasBackendResult,
  onRunBackend,
  onRunStream,
  onGoHitl,
  onGoTrace,
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const contract = workflow?.coordination_contract || {};
  const objectives = workflow?.coordination_objectives || [];
  const actions = Array.isArray(workflow?.agent_actions) ? workflow.agent_actions : [];
  const risks = Array.isArray(workflow?.risk_register) ? workflow.risk_register : [];
  const brief = workflow?.planning_brief || '';
  const finalReport = workflow?.final_report || '';
  const execSummary = workflow?.executive_summary || '';
  const critique = workflow?.critique || '';
  const kpi = workflow?.kpi_projection || {};
  const before = kpi.before || {};
  const after = kpi.after || {};
  const exportMarkdown = buildCoordinationMarkdown(workflow);
  const exportTitle = `协同产出报告-${workflow?.mission_id || 'mission'}`;

  const handleExportMarkdown = useCallback(() => {
    downloadBlob(`${exportTitle}.md`, exportMarkdown, 'text/markdown;charset=utf-8');
  }, [exportMarkdown, exportTitle]);

  const handleExportWord = useCallback(() => {
    const html = buildExportHtml(exportTitle, exportMarkdown, workflow?.mission_id);
    downloadBlob(`${exportTitle}.doc`, html, 'application/msword;charset=utf-8');
  }, [exportMarkdown, exportTitle, workflow?.mission_id]);

  const handleExportPdf = useCallback(() => {
    const html = buildExportHtml(exportTitle, exportMarkdown, workflow?.mission_id);
    const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  }, [exportMarkdown, exportTitle, workflow?.mission_id]);

  if (backendLoading) {
    return (
      <div className="panel panel-glow-orange" style={{ flex: '0 0 auto', padding: '12px 14px' }}>
        <div style={{ fontSize: 12, color: '#ff9500', fontWeight: 600 }}>{backendStreaming ? '⚡ 流式执行中…' : '⏳ 正在调用后端多智能体工作流…'}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>Planner → 各专业 Agent → 仿真 → Critic；完成后此处展示契约、动作清单与报告摘要。</div>
      </div>
    );
  }

  if (!hasBackendResult || !workflow) {
    return (
      <div className="panel" style={{ flex: '0 0 auto', padding: '12px 14px', border: '1px dashed rgba(0,195,255,0.35)', background: 'rgba(0,195,255,0.04)' }}>
        <div style={{ fontSize: 12, color: '#00c3ff', fontWeight: 700, marginBottom: 6 }}>协同编排产出</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 10 }}>
          当前结果区只展示真实后端返回的 `workflow_state`。请点击下方按钮运行一次工作流，此处将展示<strong>协同目标、契约参数、各专业动作、KPI 投影、Critic 意见与完整 Markdown 报告</strong>。
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={onRunBackend} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,195,255,0.55)', background: 'rgba(0,195,255,0.18)', color: '#00c3ff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>运行后端协同</button>
          <button type="button" onClick={onRunStream} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,255,200,0.5)', background: 'rgba(0,255,200,0.12)', color: '#00ffc8', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>流式运行（SSE）</button>
        </div>
      </div>
    );
  }

  const chip = (label, val, unit = '') => (
    <span key={label} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(0,195,255,0.08)', border: '1px solid rgba(0,195,255,0.2)', color: 'var(--text-secondary)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>{' '}
      <span style={{ color: '#00ffc8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{val}{unit}</span>
    </span>
  );

  const actionCard = (action, idx) => (
    <div key={`${action.agent || 'agent'}-${idx}`} style={{ fontSize: 10.5, padding: '6px 8px', borderRadius: 6, background: 'rgba(0,195,255,0.06)', borderLeft: `3px solid ${action.priority === 'critical' ? '#ff3b3b' : action.priority === 'high' ? '#ff9500' : '#00c3ff'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: '#7ab8d8', fontWeight: 700 }}>{action.agent || 'agent'}</span>
        <span style={{ color: 'var(--text-primary)' }}>{action.title || '动作'}</span>
      </div>
      {action.detail && <div style={{ marginTop: 4, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{action.detail}</div>}
    </div>
  );

  const exportButtonStyle = {
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 5,
    padding: '5px 10px',
    cursor: 'pointer',
  };

  return (
    <>
    <div className="panel panel-glow-green" style={{ flex: '0 0 auto', maxHeight: '42%', minHeight: 120, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-title">协同产出</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{workflow.mission_id || '—'}</span>
        <button type="button" onClick={() => setDetailOpen(true)} style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#00c3ff', background: 'rgba(0,195,255,0.12)', border: '1px solid rgba(0,195,255,0.28)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>
          详情查看
        </button>
        <button type="button" onClick={handleExportMarkdown} style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#00ffc8', background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.28)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>
          导出 .md
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {objectives.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, marginBottom: 4 }}>协同目标</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, marginBottom: 4 }}>协同契约（Planner）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chip('提速目标', contract.target_speed_gain_pct, '%')}
            {chip('拥堵下降', contract.target_congestion_drop_pct, '%')}
            {chip('延误下降', contract.target_delay_drop_pct, '%')}
            {chip('匝道上限', contract.max_ramp_drop_pct, '%')}
            {chip('绿信比下限', contract.min_signal_green_ext_pct, '%')}
            {chip('公交运力下限', contract.min_transit_boost_pct, '%')}
          </div>
          {Array.isArray(contract.hard_constraints) && contract.hard_constraints.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>硬约束：{contract.hard_constraints.join('；')}</div>
          )}
        </div>
        {actions.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, marginBottom: 4 }}>各专业动作（{actions.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {actions.slice(0, 6).map((a, i) => (
                <div key={i} style={{ fontSize: 10.5, padding: '5px 8px', borderRadius: 5, background: 'rgba(0,195,255,0.06)', borderLeft: `3px solid ${a.priority === 'critical' ? '#ff3b3b' : a.priority === 'high' ? '#ff9500' : '#00c3ff'}` }}>
                  <span style={{ color: '#7ab8d8', fontWeight: 600 }}>{a.agent}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>·</span>
                  <span style={{ color: 'var(--text-primary)' }}>{a.title || '动作'}{a.detail ? ` — ${a.detail}` : ''}</span>
                </div>
              ))}
              {actions.length > 6 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>… 另有 {actions.length - 6} 条，见指挥台动作清单</div>}
            </div>
          </div>
        )}
        {(before.avg_speed_mph != null || after.avg_speed_mph != null) && (
          <div>
            <div style={{ fontSize: 10, color: '#00c3ff', fontWeight: 600, marginBottom: 4 }}>KPI 投影（仿真）</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
              均速 {before.avg_speed_mph ?? '—'} → {after.avg_speed_mph ?? '—'} mph &nbsp;|&nbsp;
              拥堵 {before.congestion_pct ?? '—'} → {after.congestion_pct ?? '—'} %
            </div>
          </div>
        )}
        {(critique || risks.length > 0) && (
          <div style={{ padding: '6px 8px', background: 'rgba(255,213,0,0.06)', border: '1px solid rgba(255,213,0,0.2)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: '#ffd700', fontWeight: 600 }}>Critic · 风险 {risks.length} 条</div>
            {critique && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.55 }}>{critique.slice(0, 220)}{critique.length > 220 ? '…' : ''}</div>}
            {risks.length > 0 && (
              <button type="button" onClick={onGoHitl} style={{ marginTop: 6, fontSize: 10, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(255,149,0,0.45)', background: 'rgba(255,149,0,0.12)', color: '#ff9500', cursor: 'pointer', fontWeight: 600 }}>
                去 HITL 审批 →
              </button>
            )}
          </div>
        )}
        {(execSummary || brief) && (
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.55, borderTop: '1px solid rgba(0,195,255,0.1)', paddingTop: 6 }}>
            <strong style={{ color: '#00ffc8' }}>执行摘要：</strong>{execSummary || brief.slice(0, 280)}{(!execSummary && brief.length > 280) ? '…' : ''}
          </div>
        )}
        {finalReport && (
          <div>
            <button type="button" onClick={() => setReportOpen(v => !v)} style={{ fontSize: 10, fontWeight: 600, color: '#00ffc8', background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.35)', borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>
              {reportOpen ? '收起完整报告' : '展开完整 Markdown 报告'}
            </button>
            {reportOpen && (
              <div style={{ marginTop: 8, maxHeight: 240, overflow: 'auto', padding: '8px 10px', background: 'rgba(0,10,24,0.5)', borderRadius: 6, border: '1px solid rgba(0,195,255,0.15)' }}>
                <MarkdownContent>{finalReport}</MarkdownContent>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" onClick={() => setDetailOpen(true)} style={{ ...exportButtonStyle, color: '#00c3ff', background: 'rgba(0,195,255,0.12)', border: '1px solid rgba(0,195,255,0.28)' }}>弹窗查看详情</button>
          <button type="button" onClick={handleExportWord} style={{ ...exportButtonStyle, color: '#7ab8d8', background: 'transparent', border: '1px solid rgba(122,184,216,0.35)' }}>导出 Word(.doc)</button>
          <button type="button" onClick={handleExportPdf} style={{ ...exportButtonStyle, color: '#ffd700', background: 'rgba(255,213,0,0.08)', border: '1px solid rgba(255,213,0,0.28)' }}>导出 PDF</button>
          <button type="button" onClick={onGoTrace} style={{ fontSize: 10, color: '#7ab8d8', background: 'transparent', border: '1px solid rgba(122,184,216,0.35)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>查看执行轨迹 →</button>
        </div>
      </div>
    </div>
    {detailOpen && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0, 8, 20, 0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="panel panel-glow-green" style={{ width: 'min(1380px, calc(100vw - 48px))', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' }}>
          <div className="panel-header" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="panel-title">协同产出详情</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{workflow?.mission_id || '—'}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleExportMarkdown} style={{ ...exportButtonStyle, color: '#00ffc8', background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.28)' }}>导出 .md</button>
              <button type="button" onClick={handleExportWord} style={{ ...exportButtonStyle, color: '#7ab8d8', background: 'transparent', border: '1px solid rgba(122,184,216,0.35)' }}>导出 Word(.doc)</button>
              <button type="button" onClick={handleExportPdf} style={{ ...exportButtonStyle, color: '#ffd700', background: 'rgba(255,213,0,0.08)', border: '1px solid rgba(255,213,0,0.28)' }}>导出 PDF</button>
              <button type="button" onClick={() => setDetailOpen(false)} style={{ ...exportButtonStyle, color: '#ff8c8c', background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.28)' }}>关闭</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(320px,0.8fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>协同目标</div>
                {objectives.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    {objectives.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回协同目标。</div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 320, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,255,200,0.14)', background: 'rgba(0,10,24,0.58)', overflow: 'auto' }}>
                <div style={{ fontSize: 11, color: '#00ffc8', fontWeight: 700, marginBottom: 8 }}>Markdown 报告</div>
                {finalReport ? <MarkdownContent>{finalReport}</MarkdownContent> : <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{exportMarkdown}</pre>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>协同契约</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {chip('提速目标', contract.target_speed_gain_pct, '%')}
                  {chip('拥堵下降', contract.target_congestion_drop_pct, '%')}
                  {chip('延误下降', contract.target_delay_drop_pct, '%')}
                  {chip('匝道上限', contract.max_ramp_drop_pct, '%')}
                  {chip('绿信比下限', contract.min_signal_green_ext_pct, '%')}
                  {chip('公交运力下限', contract.min_transit_boost_pct, '%')}
                </div>
                {Array.isArray(contract.hard_constraints) && contract.hard_constraints.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>硬约束：{contract.hard_constraints.join('；')}</div>
                )}
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>动作清单</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                  {actions.length > 0 ? actions.map(actionCard) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回专业动作。</div>}
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,195,255,0.14)', background: 'rgba(0,195,255,0.04)' }}>
                <div style={{ fontSize: 11, color: '#00c3ff', fontWeight: 700, marginBottom: 8 }}>结果摘要</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    <strong style={{ color: '#7ab8d8' }}>执行摘要：</strong>{execSummary || brief || '—'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                    <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(0,10,24,0.42)', fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      均速 {before.avg_speed_mph ?? '—'} {'->'} {after.avg_speed_mph ?? '—'} mph
                    </div>
                    <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(0,10,24,0.42)', fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      拥堵 {before.congestion_pct ?? '—'} {'->'} {after.congestion_pct ?? '—'} %
                    </div>
                  </div>
                  <div style={{ padding: '8px 9px', borderRadius: 6, background: 'rgba(255,213,0,0.05)', border: '1px solid rgba(255,213,0,0.18)' }}>
                    <div style={{ fontSize: 10.5, color: '#ffd700', fontWeight: 700, marginBottom: 6 }}>Critic / 风险</div>
                    {critique && <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{critique}</div>}
                    {risks.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {risks.map((risk, idx) => <li key={`${risk.id || idx}-${idx}`}>{formatRiskItem(risk)}</li>)}
                      </ul>
                    )}
                    {!critique && risks.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>当前任务未返回风险项。</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ============================================================
// COORDINATION TAB (TAB 0)
// ============================================================
function CoordinationTab({
  state,
  dispatch,
  scenario,
  runBackendMission,
  runBackendMissionStream,
  missionHistory,
  loadMissionDetail,
  refreshOverview,
  refreshHistory,
}) {
  const wf = state.backend.result?.workflow_state;
  const hasBackendResult = Boolean(state.backend.result);
  const hasTrace = state.trace.entries.length > 0;
  const hasEvents = state.events.length > 0;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden' }}>
        <CoordinationOutputPanel
          workflow={wf}
          backendLoading={state.backend.loading}
          backendStreaming={state.backend.streaming}
          hasBackendResult={hasBackendResult}
          onRunBackend={runBackendMission}
          onRunStream={runBackendMissionStream}
          onGoHitl={() => dispatch({ type: 'SET_INNER_TAB', tab: 2 })}
          onGoTrace={() => dispatch({ type: 'SET_INNER_TAB', tab: 1 })}
        />
        <div className="panel" style={{ flex: '0 0 180px', minHeight: 0, overflow: 'hidden' }}>
          {(hasBackendResult || hasTrace) ? (
            <StageBoard stages={state.stages} cycle={state.cycle} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header">
                <span className="panel-title">执行阶段</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>等待后端</span>
              </div>
              <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                只有工作流返回真实 `_node_trace` 后，这里才展示阶段推进，不再播放本地模拟编排。
              </div>
            </div>
          )}
        </div>
        <div className="panel" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {(hasBackendResult || hasEvents) ? (
            <EventTimelinePanel events={state.events} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header">
                <span className="panel-title">事件流</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>WebSocket / Workflow</span>
              </div>
              <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                等待真实工作流启动后写入事件。
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden' }}>
        <div className="panel" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <WorkbenchPanel
            state={state}
            scenario={scenario}
            onScenarioChange={id => dispatch({ type: 'RESET_SCENARIO', scenarioId: id })}
            onRunBackend={runBackendMission}
            onRunStream={runBackendMissionStream}
            missionHistory={missionHistory}
            onClearBackend={() => dispatch({ type: 'CLEAR_BACKEND' })}
            onLoadMission={loadMissionDetail}
            onRefreshOverview={refreshOverview}
            onRefreshHistory={refreshHistory}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export default function AgentSystem() {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, () => buildInitialState(SCENARIOS[0].id));
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [hitlApplyLoading, setHitlApplyLoading] = useState(false);
  const scenario = useMemo(() => getScenarioById(state.scenarioId), [state.scenarioId]);

  // WebSocket
  useEffect(() => {
    let disposed = false;
    const wsUrl = `${BACKEND_URL.replace(/^http/i, 'ws')}/agents/events/ws`;
    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current) return;
      reconnectTimerRef.current = window.setTimeout(() => { reconnectTimerRef.current = null; connect(); }, 1600);
    };
    const connect = () => {
      if (disposed) return;
      dispatch({ type: 'WS_STATUS', connected: false, reconnecting: true });
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => { if (disposed) return; dispatch({ type: 'WS_STATUS', connected: true, reconnecting: false }); try { ws.send('ping'); } catch {} };
        ws.onmessage = (e) => {
          if (disposed) return;
          try {
            const p = JSON.parse(e.data);
            if (p?.type === 'heartbeat' || p?.type === 'pong') {
              dispatch({ type: 'WS_STATUS', connected: true, reconnecting: false });
              return;
            }
            if (p?.type === 'workflow_completed') {
              loadMissionHistory();
              loadAgentOverview();
            }
            dispatch({ type: 'WS_EVENT', payload: p });
          } catch {}
        };
        ws.onerror = () => { if (!disposed) dispatch({ type: 'WS_STATUS', connected: false, reconnecting: true }); };
        ws.onclose = () => { if (!disposed) { dispatch({ type: 'WS_STATUS', connected: false, reconnecting: true }); scheduleReconnect(); } };
      } catch { dispatch({ type: 'WS_STATUS', connected: false, reconnecting: true }); scheduleReconnect(); }
    };
    connect();
    return () => { disposed = true; if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; } if (wsRef.current) { try { wsRef.current.close(); } catch {} } };
  }, []);

  const _buildRunBody = useCallback(() => ({
    dataset: scenario.dataset, scenario: scenario.title,
    raw_prediction: scenario.prediction,
    avg_speed_mph: scenario.avgSpeed, severe_sensor_counts: scenario.severe,
    horizons_min: scenario.horizons, location: scenario.location, max_revision_rounds: 2,
  }), [scenario]);

  const loadAgentOverview = useCallback(() => {
    fetch(`${BACKEND_URL}/agents/overview`)
      .then(r => r.json())
      .then(d => dispatch({ type: 'OVERVIEW_LOADED', payload: d }))
      .catch(() => {});
  }, []);

  // 加载任务历史
  const loadMissionHistory = useCallback(() => {
    return fetch(`${BACKEND_URL}/agents/missions?limit=20`)
      .then(r => r.json())
      .then(d => {
        const missions = d.missions || [];
        dispatch({ type: 'MISSION_HISTORY_LOADED', missions });
        return missions;
      })
      .catch(() => []);
  }, []);

  const loadMissionDetail = useCallback(async (missionId) => {
    if (!missionId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/agents/missions/${missionId}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      const payload = await res.json();
      dispatch({ type: 'BACKEND_SUCCESS', payload: normalizeMissionDetailPayload(payload) });
      dispatch({ type: 'HITL_SYNCED_FROM_BACKEND', decisions: payload.hitl_decisions || [] });
    } catch (err) {
      dispatch({ type: 'BACKEND_ERROR', error: `加载历史任务失败：${err.message}` });
    }
  }, []);

  useEffect(() => {
    loadAgentOverview();
    loadMissionHistory().then(missions => {
      if (!state.backend.result?.workflow_state?.mission_id && missions.length > 0) {
        loadMissionDetail(missions[0].mission_id);
      }
    });
  }, [loadAgentOverview, loadMissionHistory, loadMissionDetail]);

  // 标准 POST /agents/run
  const runBackendMission = useCallback(async () => {
    dispatch({ type: 'BACKEND_START' });
    try {
      const res = await fetch(`${BACKEND_URL}/agents/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_buildRunBody()),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }
      const payload = await res.json();
      dispatch({ type: 'BACKEND_SUCCESS', payload });
      loadMissionHistory();
      loadAgentOverview();
    } catch (err) {
      dispatch({ type: 'BACKEND_ERROR', error: `调用失败：${err.message}。请确认后端已在 ${BACKEND_URL} 启动。` });
    }
  }, [_buildRunBody, loadMissionHistory, loadAgentOverview]);

  // SSE 流式 POST /agents/run/stream
  const runBackendMissionStream = useCallback(async () => {
    dispatch({ type: 'BACKEND_START' });
    try {
      const res = await fetch(`${BACKEND_URL}/agents/run/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_buildRunBody()),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t}`); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { loadMissionHistory(); loadAgentOverview(); return; }
          try {
            const obj = JSON.parse(data);
            if (obj.type === 'node_complete') {
              dispatch({ type: 'STREAM_NODE_EVENT', node: obj.node, durationMs: obj.duration_ms, startMs: obj.start_ms });
            } else if (obj.type === 'workflow_result') {
              dispatch({ type: 'BACKEND_SUCCESS', payload: { workflow_state: obj.workflow_state } });
              loadMissionHistory();
              loadAgentOverview();
            } else if (obj.type === 'error') {
              dispatch({ type: 'BACKEND_ERROR', error: obj.message });
            }
          } catch {}
        }
      }
    } catch (err) {
      dispatch({ type: 'BACKEND_ERROR', error: `流式调用失败：${err.message}` });
    }
  }, [_buildRunBody, loadMissionHistory, loadAgentOverview]);

  // HITL 决策（本地 + 持久化到后端）
  const handleHitlDecide = useCallback(async ({ riskId, action: act, reason }) => {
    dispatch({ type: 'HITL_DECIDE', riskId, action: act, reason });
    const missionId = state.backend.result?.workflow_state?.mission_id;
    if (missionId && act) {
      try {
        await fetch(`${BACKEND_URL}/agents/hitl/${missionId}/decide`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ risk_id: riskId, action: act, reason: reason || '' }),
        });
      } catch {}
    }
  }, [state.backend.result]);

  // HITL 应用 - 重跑携带决策
  const handleHitlApply = useCallback(async () => {
    const missionId = state.backend.result?.workflow_state?.mission_id;
    if (!missionId) return;
    setHitlApplyLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/agents/hitl/${missionId}/apply`, { method: 'POST' });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      if (data.workflow_state) {
        dispatch({ type: 'HITL_APPLY_SUCCESS', workflowState: data.workflow_state });
        loadMissionHistory();
        loadAgentOverview();
      }
    } catch (err) {
      dispatch({ type: 'BACKEND_ERROR', error: `HITL 重跑失败：${err.message}` });
    }
    setHitlApplyLoading(false);
  }, [state.backend.result, loadMissionHistory, loadAgentOverview]);

  const hitlPendingCount = useMemo(() => {
    const workflow = state.backend.result?.workflow_state || {};
    const risks = workflow.risk_register || state.hitl.pendingRisks || [];
    return risks.filter(r => !state.hitl.decisions.some(d => d.riskId === r.id)).length;
  }, [state.backend.result, state.hitl]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0, padding: '8px 10px 8px', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Mission banner */}
      <MissionBar state={state} scenario={scenario} overview={state.backend.overview} />

      {/* Inner tab navigation */}
      <InnerTabNav activeTab={state.innerTab} onTabChange={tab => dispatch({ type: 'SET_INNER_TAB', tab })} hitlPendingCount={hitlPendingCount} wsConnected={state.ws.connected} />

      {/* Tab content area */}
      <div style={{ flex: 1, minHeight: 0, background: 'rgba(0,10,24,0.4)', border: '1px solid rgba(0,195,255,0.15)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {state.innerTab === 0 && (
          <CoordinationTab
            state={state}
            dispatch={dispatch}
            scenario={scenario}
            runBackendMission={runBackendMission}
            runBackendMissionStream={runBackendMissionStream}
            missionHistory={state.missionHistory}
            loadMissionDetail={loadMissionDetail}
            refreshOverview={loadAgentOverview}
            refreshHistory={loadMissionHistory}
          />
        )}

        {state.innerTab === 1 && (
          <TracePanel trace={state.trace} stages={state.stages} agents={state.agents} events={state.events} onSelectNode={nodeId => dispatch({ type: 'TRACE_SELECT', nodeId })} />
        )}

        {state.innerTab === 2 && (
          <HITLPanel hitl={state.hitl} backendResult={state.backend.result} onDecide={handleHitlDecide} onApply={handleHitlApply} applyLoading={hitlApplyLoading} />
        )}

        {state.innerTab === 3 && (
          <ChatPanel
            chatState={state.chat}
            scenario={scenario}
            consensusScore={state.consensusScore}
            backendResult={state.backend.result}
            dispatch={dispatch}
          />
        )}
      </div>
    </div>
  );
}
