import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { AGENT_DECISIONS, SIMULATION_RESULTS, generateSystemLogs } from '../../data/trafficData';
import RealtimeNodeFeaturePanel from "../../components/RealtimeNodeFeaturePanel";

// ============================================================
// RIGHT PANEL - Agent Decision & Simulation Results
// ============================================================

// Agent Relationship Network Graph
function AgentNetworkGraph() {
  const nodes = [
    { id: 'global', name: '全局协调', x: 0.5, y: 0.18, color: '#00c3ff', size: 22, status: 'running' },
    { id: 'signal', name: '信控优化', x: 0.15, y: 0.45, color: '#39ff6a', size: 18, status: 'processing' },
    { id: 'traffic', name: '交通管控', x: 0.85, y: 0.45, color: '#ff9500', size: 18, status: 'standby' },
    { id: 'transit', name: '公共交通', x: 0.15, y: 0.78, color: '#b24bff', size: 18, status: 'completed' },
    { id: 'travel', name: '出行服务', x: 0.85, y: 0.78, color: '#ffd700', size: 18, status: 'running' },
    { id: 'sim', name: '仿真评估', x: 0.5, y: 0.92, color: '#ff6b9d', size: 16, status: 'processing' },
  ];
  const edges = [
    { source: 'global', target: 'signal' },
    { source: 'global', target: 'traffic' },
    { source: 'global', target: 'transit' },
    { source: 'global', target: 'travel' },
    { source: 'global', target: 'sim' },
    { source: 'signal', target: 'sim' },
    { source: 'traffic', target: 'sim' },
    { source: 'signal', target: 'traffic' },
    { source: 'transit', target: 'travel' },
  ];

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const statusLabel = { running: '运行中', processing: '处理中', standby: '待命', completed: '已完成' };
          return `${params.data.name}<br/>状态: ${statusLabel[params.data.status] || '未知'}`;
        }
        return '';
      },
    },
    series: [{
      type: 'graph',
      layout: 'none',
      roam: false,
      data: nodes.map(n => ({
        id: n.id,
        name: n.name,
        status: n.status,
        x: n.x * 300,
        y: n.y * 200,
        symbolSize: n.size,
        itemStyle: {
          color: n.color,
          borderColor: n.color + '55',
          borderWidth: 3,
          shadowColor: n.color,
          shadowBlur: 12,
        },
        label: {
          show: true,
          position: 'bottom',
          color: n.color,
          fontSize: 10,
          fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        },
      })),
      edges: edges.map(e => ({
        source: e.source,
        target: e.target,
        lineStyle: {
          color: 'rgba(0,195,255,0.25)',
          width: 1.5,
          curveness: 0.2,
          type: 'solid',
        },
      })),
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 3 },
      },
    }],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

// Simulation Comparison Radar
function SimulationRadar() {
  const { indicators, before, after } = SIMULATION_RESULTS;
  // max 值均为 5 的整数倍，配合 splitNumber:5 可整除，消除 alignTicks 警告
  const maxVals = [80, 60, 30, 100, 120];
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
    },
    legend: {
      data: ['干预前', '干预后'],
      bottom: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    radar: {
      indicator: indicators.map((name, i) => ({ name, max: maxVals[i], min: 0 })),
      center: ['50%', '48%'],
      radius: '68%',
      splitNumber: 5,          // 5 可整除所有 max 值 (80/5=16, 60/5=12, 30/5=6, 100/5=20, 120/5=24)
      axisName: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      axisLabel: { show: false }, // 隐藏刻度数字，彻底消除 alignTicks 可读性警告
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.12)' } },
      splitArea: {
        areaStyle: {
          color: ['rgba(0,195,255,0.03)', 'rgba(0,195,255,0.06)'],
        },
      },
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
    },
    series: [{
      type: 'radar',
      data: [
        {
          name: '干预前',
          value: before,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#ff6b6b', width: 1.5 },
          areaStyle: { color: 'rgba(255,107,107,0.1)' },
          itemStyle: { color: '#ff6b6b' },
        },
        {
          name: '干预后',
          value: after,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#00c3ff', width: 2 },
          areaStyle: { color: 'rgba(0,195,255,0.12)' },
          itemStyle: { color: '#00c3ff' },
        },
      ],
    }],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

// Before/After Comparison Bar Chart
function ComparisonBar() {
  const { indicators, before, after, improvement } = SIMULATION_RESULTS;
  const shortLabels = ['路网均速', '拥堵比例', '延误时间', '通行效率', '总里程'];
  const option = {
    backgroundColor: 'transparent',
    grid: { top: 12, bottom: 28, left: 60, right: 20 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => {
        let str = `${params[0].axisValue}<br/>`;
        params.forEach(p => {
          str += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
        });
        return str;
      },
    },
    legend: {
      data: ['干预前', '干预后'],
      right: 0,
      top: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.08)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
    },
    yAxis: {
      type: 'category',
      data: shortLabels,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(200,230,250,0.6)', fontSize: 10 },
    },
    series: [
      {
        name: '干预前',
        type: 'bar',
        data: before,
        barWidth: 8,
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [{ offset: 0, color: '#ff6b6b88' }, { offset: 1, color: '#ff6b6b' }]
          },
          borderRadius: [0, 4, 4, 0],
        },
      },
      {
        name: '干预后',
        type: 'bar',
        data: after,
        barWidth: 8,
        barGap: '30%',
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [{ offset: 0, color: '#00c3ff44' }, { offset: 1, color: '#00c3ff' }]
          },
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

// Agent Decision Log
function AgentDecisionLog({ decisions }) {
  const statusColors = {
    executing: '#39ff6a',
    pending: '#ff9500',
    completed: '#00c3ff',
    failed: '#ff3b3b',
  };
  const statusLabels = {
    executing: '执行中',
    pending: '待执行',
    completed: '已完成',
    failed: '失败',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {decisions.map(d => (
        <div key={d.id} style={{
          padding: '8px 10px',
          background: 'rgba(0,195,255,0.04)',
          border: '1px solid rgba(0,195,255,0.1)',
          borderRadius: 4,
          fontSize: 11,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 10,
                background: 'rgba(0,195,255,0.12)',
                color: '#00c3ff',
                fontWeight: 500,
              }}>
                {d.agentType}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{d.action}</span>
            </div>
            <span style={{
              fontSize: 10,
              color: statusColors[d.status],
              fontWeight: 600,
              flexShrink: 0,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: statusColors[d.status],
                display: 'inline-block',
                marginRight: 4,
                animation: d.status === 'executing' ? 'breathe 1.5s ease-in-out infinite' : 'none',
              }} />
              {statusLabels[d.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)', fontSize: 10 }}>
            <span>{d.location}</span>
            <span>预期提升 {d.expectedSpeedUp}%</span>
            <span>置信度 {(d.confidence * 100).toFixed(0)}%</span>
            <span style={{ marginLeft: 'auto' }}>{d.time}</span>
          </div>
          {/* Progress bar for executing */}
          {d.status === 'executing' && (
            <div style={{ marginTop: 5 }}>
              <div style={{ height: 2, background: 'rgba(57,255,106,0.15)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${60 + Math.random() * 30}%`,
                  background: 'linear-gradient(90deg, #39ff6a88, #39ff6a)',
                  borderRadius: 1,
                  animation: 'skeleton-wave 2s infinite',
                  backgroundSize: '200% 100%',
                }} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Real-time System Log
function SystemLog() {
  const [logs, setLogs] = useState(() => generateSystemLogs(15));
  const scrollRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setLogs(prev => {
        const newLog = generateSystemLogs(1)[0];
        newLog.id = `log-rt-${Date.now()}`;
        newLog.time = new Date().toTimeString().slice(0, 8);
        const next = [newLog, ...prev].slice(0, 20);
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const levelColors = {
    info: '#00c3ff',
    success: '#39ff6a',
    warn: '#ff9500',
    error: '#ff3b3b',
  };

  const levelBg = {
    info: 'rgba(0,195,255,0.06)',
    success: 'rgba(57,255,106,0.06)',
    warn: 'rgba(255,149,0,0.06)',
    error: 'rgba(255,59,59,0.06)',
  };

  return (
    <div ref={scrollRef} className="scroll-panel" style={{ height: '100%', padding: '6px 8px' }}>
      {logs.map((log, i) => (
        <div key={log.id} style={{
          display: 'flex',
          gap: 6,
          padding: '3px 6px',
          marginBottom: 2,
          borderRadius: 3,
          background: i === 0 ? levelBg[log.level] || 'transparent' : 'transparent',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          animation: i === 0 ? 'slide-in-up 0.3s ease' : 'none',
          borderLeft: i === 0 ? `2px solid ${levelColors[log.level]}` : '2px solid transparent',
        }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{log.time}</span>
          <span style={{
            color: levelColors[log.level] || '#cde8fa',
            flexShrink: 0,
            fontSize: 10,
            width: 42,
            textAlign: 'center',
            fontWeight: 600,
          }}>
            {log.level.toUpperCase()}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {log.msg}
          </span>
        </div>
      ))}
    </div>
  );
}

// Improvement metrics row
function ImprovementRow() {
  const items = [
    { label: '车速提升', value: '+22.6%', target: '≥15%', achieved: true },
    { label: '拥堵缩短', value: '-25.3%', target: '≥20%', achieved: true },
    { label: '通行效率', value: '+21.1%', target: '≥15%', achieved: true },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
      {items.map(item => (
        <div key={item.label} style={{
          padding: '6px 8px',
          background: item.achieved ? 'rgba(57,255,106,0.06)' : 'rgba(255,59,59,0.06)',
          border: `1px solid ${item.achieved ? 'rgba(57,255,106,0.2)' : 'rgba(255,59,59,0.2)'}`,
          borderRadius: 4,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 14, fontFamily: 'var(--font-num)', fontWeight: 700,
            color: item.achieved ? '#39ff6a' : '#ff3b3b',
            textShadow: `0 0 8px ${item.achieved ? 'rgba(57,255,106,0.5)' : 'rgba(255,59,59,0.5)'}`,
          }}>
            {item.value}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{item.label}</div>
          <div style={{ fontSize: 9, color: item.achieved ? '#39ff6a' : '#ff3b3b', marginTop: 1, opacity: 0.7 }}>
            {item.achieved ? '✓' : '✗'} 目标 {item.target}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN RIGHT PANEL EXPORT
// ============================================================
export default function RightPanel() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: 8,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* Agent Network */}
      <div className="panel" style={{ flexShrink: 0, height: 200 }}>
        <div className="panel-header">
          <span className="panel-title">多智能体协同状态</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#39ff6a' }}>6 Agents 在线</span>
        </div>
        <div style={{ height: 170 }}>
          <AgentNetworkGraph />
        </div>
      </div>

      {/* Agent Decision Log */}
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">决策指令队列</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {AGENT_DECISIONS.filter(d => d.status === 'executing').length} 执行中
          </span>
        </div>
        <div className="panel-body">
          <AgentDecisionLog decisions={AGENT_DECISIONS} />
        </div>
      </div>

      {/* Simulation improvement row */}
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">SUMO 仿真评估结果</span>
          <span style={{
            marginLeft: 'auto', fontSize: 10,
            padding: '2px 6px',
            background: 'rgba(57,255,106,0.1)',
            border: '1px solid rgba(57,255,106,0.3)',
            borderRadius: 3,
            color: '#39ff6a',
            fontWeight: 600,
          }}>
            全部达标
          </span>
        </div>
        <div className="panel-body">
          <ImprovementRow />
        </div>
      </div>

      {/* Radar comparison */}
      <div className="panel" style={{ flexShrink: 0, height: 180 }}>
        <div className="panel-header">
          <span className="panel-title">路网指标雷达对比</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>干预前 vs 后</span>
        </div>
        <div style={{ height: 148 }}>
          <SimulationRadar />
        </div>
      </div>

      {/* Bar comparison */}
      <div className="panel" style={{ flexShrink: 0, height: 160 }}>
        <div className="panel-header">
          <span className="panel-title">核心指标对比</span>
        </div>
        <div style={{ height: 128 }}>
          <ComparisonBar />
        </div>
      </div>
      <RealtimeNodeFeaturePanel initialNodeId="1001" />

      {/* System Log */}
      <div className="panel" style={{ flex: 1, minHeight: 140 }}>
        <div className="panel-header">
          <span className="panel-title">系统实时日志</span>
          <span style={{
            marginLeft: 'auto',
            width: 6, height: 6, borderRadius: '50%',
            background: '#39ff6a',
            boxShadow: '0 0 6px rgba(57,255,106,0.8)',
            animation: 'breathe 1.5s ease-in-out infinite',
            display: 'inline-block',
          }} />
        </div>
        <div style={{ height: 'calc(100% - 34px)' }}>
          <SystemLog />
        </div>
      </div>
    </div>
  );
}
