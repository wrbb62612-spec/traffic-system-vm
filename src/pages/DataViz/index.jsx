import { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  HOURLY_DATA, MODEL_ACCURACY, PEMS_DATASETS,
  WEEKLY_HEATMAP, SIMULATION_RESULTS
} from '../../data/trafficData';

// ============================================================
// DATA VISUALIZATION PAGE
// 6 charts: Flow Comparison, Speed-Flow, Sensor Radar,
//           Prediction Accuracy, Congestion Heatmap, Data Stats
// ============================================================

// Chart panel wrapper
function ChartPanel({ title, subtitle, children, height = 260, controls }) {
  return (
    <div className="panel panel-corner" style={{ display: 'flex', flexDirection: 'column', height }}>
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <span className="panel-title">{title}</span>
        {subtitle && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)' }}>{subtitle}</span>}
        {controls && <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>{controls}</div>}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// Segment button group
function SegmentGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            background: value === opt.value ? 'rgba(0,195,255,0.15)' : 'transparent',
            border: `1px solid ${value === opt.value ? 'rgba(0,195,255,0.5)' : 'rgba(0,195,255,0.15)'}`,
            borderRadius: 3,
            color: value === opt.value ? '#00c3ff' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.2s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// CHART 1: Traffic Flow Comparison (Multi-line)
// ============================================================
function FlowComparisonChart({ metric }) {
  const datasetColors = {
    PEMS03: '#00c3ff',
    PEMS04: '#39ff6a',
    PEMS07: '#ff9500',
    PEMS08: '#b24bff',
  };

  const series = Object.entries(HOURLY_DATA).filter(([k]) => k !== 'hours').map(([ds, data]) => ({
    name: ds,
    type: 'line',
    data: data[metric],
    smooth: true,
    symbol: 'none',
    lineStyle: { color: datasetColors[ds], width: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: datasetColors[ds] + '28' },
          { offset: 1, color: datasetColors[ds] + '04' },
        ],
      },
    },
    itemStyle: { color: datasetColors[ds] },
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => {
        let html = `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach(p => {
          html += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b> ${metric === 'flow' ? '辆/5min' : 'km/h'}</div>`;
        });
        return html;
      },
    },
    legend: {
      data: ['PEMS03', 'PEMS04', 'PEMS07', 'PEMS08'],
      top: 0,
      right: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 8,
    },
    grid: { top: 28, bottom: 32, left: 45, right: 20 },
    xAxis: {
      type: 'category',
      data: HOURLY_DATA.hours,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9, interval: 3 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: metric === 'flow' ? '流量(辆/5min)' : '速度(km/h)',
      nameTextStyle: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
    },
    series,
  };

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// CHART 2: Speed-Flow Scatter (Fundamental Diagram)
// ============================================================
function SpeedFlowScatter({ dataset }) {
  const rng = (() => {
    let s = dataset.charCodeAt(4) * 97 + 31;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  })();

  const scatterData = Array.from({ length: 200 }, () => {
    const flow = rng() * 3800 + 200;
    const capacityFlow = 2000;
    let speed;
    if (flow < capacityFlow * 0.5) {
      speed = 65 + rng() * 10 - 5;
    } else if (flow < capacityFlow) {
      const t = (flow - capacityFlow * 0.5) / (capacityFlow * 0.5);
      speed = 65 - t * 35 + (rng() - 0.5) * 8;
    } else {
      const t = (flow - capacityFlow) / capacityFlow;
      speed = 30 - t * 25 + (rng() - 0.5) * 10;
    }
    return [Math.round(flow), Math.max(5, Math.round(speed))];
  });

  const colorFn = (v) => {
    const speed = v[1];
    if (speed < 25) return '#ff1e1e';
    if (speed < 40) return '#ff5a00';
    if (speed < 55) return '#ffc800';
    return '#00c3ff';
  };

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => `流量: ${params.value[0]} 辆/5min<br/>速度: ${params.value[1]} km/h`,
    },
    grid: { top: 28, bottom: 32, left: 50, right: 20 },
    xAxis: {
      type: 'value',
      name: '流量(辆/5min)',
      nameTextStyle: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '速度(km/h)',
      nameTextStyle: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
      axisTick: { show: false },
    },
    series: [{
      type: 'scatter',
      data: scatterData,
      symbolSize: 5,
      itemStyle: {
        color: (params) => colorFn(params.data),
        opacity: 0.6,
      },
      emphasis: {
        itemStyle: { opacity: 1, shadowBlur: 10, shadowColor: '#00c3ff' },
      },
    }],
  };

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// CHART 3: Sensor Distribution Radar
// ============================================================
function SensorRadarChart() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
    },
    legend: {
      data: Object.keys(PEMS_DATASETS),
      bottom: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
    },
    radar: {
      indicator: [
        { name: '传感器覆盖', max: 1000 },
        { name: '数据质量', max: 100 },
        { name: '时间跨度(月)', max: 18 },
        { name: '记录总量(千)', max: 30 },
        { name: '空间密度', max: 100 },
        { name: '高峰稳定性', max: 100 },
      ],
      center: ['50%', '48%'],
      radius: '65%',
      splitNumber: 4,
      axisName: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.1)' } },
      splitArea: { areaStyle: { color: ['rgba(0,195,255,0.02)', 'rgba(0,195,255,0.05)'] } },
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
    },
    series: [{
      type: 'radar',
      data: [
        {
          name: 'PEMS03',
          value: [358, 98.4, 3, 26.2, 72, 88],
          lineStyle: { color: '#00c3ff', width: 2 },
          areaStyle: { color: 'rgba(0,195,255,0.1)' },
          itemStyle: { color: '#00c3ff' },
        },
        {
          name: 'PEMS04',
          value: [307, 99.1, 2, 17.0, 68, 91],
          lineStyle: { color: '#39ff6a', width: 2 },
          areaStyle: { color: 'rgba(57,255,106,0.08)' },
          itemStyle: { color: '#39ff6a' },
        },
        {
          name: 'PEMS07',
          value: [883, 97.6, 16, 28.2, 85, 82],
          lineStyle: { color: '#ff9500', width: 2 },
          areaStyle: { color: 'rgba(255,149,0,0.08)' },
          itemStyle: { color: '#ff9500' },
        },
        {
          name: 'PEMS08',
          value: [170, 98.8, 2, 17.9, 58, 90],
          lineStyle: { color: '#b24bff', width: 2 },
          areaStyle: { color: 'rgba(178,75,255,0.08)' },
          itemStyle: { color: '#b24bff' },
        },
      ],
    }],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// CHART 4: Model Prediction Accuracy Bar
// ============================================================
function AccuracyChart({ horizon }) {
  const horizonIdx = { '15分钟': 0, '30分钟': 1, '60分钟': 2 }[horizon] ?? 0;
  const datasets = MODEL_ACCURACY.datasets;
  const accuracyData = datasets.map(ds => MODEL_ACCURACY.accuracy_by_horizon[ds][horizonIdx]);
  const maeData = MODEL_ACCURACY.metrics.MAE;
  const rmseData = MODEL_ACCURACY.metrics.RMSE;

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => {
        let html = `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue} · ${horizon}</div>`;
        params.forEach(p => { html += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b></div>`; });
        return html;
      },
    },
    legend: {
      data: ['准确率(%)', 'MAE', 'RMSE'],
      top: 0,
      right: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
    },
    grid: { top: 30, bottom: 28, left: 40, right: 20 },
    xAxis: {
      type: 'category',
      data: datasets,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: {
        color: (value) => ({
          PEMS03: '#00c3ff', PEMS04: '#39ff6a', PEMS07: '#ff9500', PEMS08: '#b24bff',
        }[value] || '#cde8fa'),
        fontSize: 11,
        fontWeight: 600,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '准确率%',
        min: 80,
        max: 100,
        nameTextStyle: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
        axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
      },
      {
        type: 'value',
        name: 'MAE/RMSE',
        nameTextStyle: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
      },
    ],
    series: [
      {
        name: '准确率(%)',
        type: 'bar',
        yAxisIndex: 0,
        data: accuracyData,
        barWidth: 24,
        itemStyle: {
          color: (params) => {
            const cs = ['rgba(0,195,255,0.8)', 'rgba(57,255,106,0.8)', 'rgba(255,149,0,0.8)', 'rgba(178,75,255,0.8)'];
            return { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: cs[params.dataIndex] }, { offset: 1, color: cs[params.dataIndex].replace('0.8', '0.3') }]
            };
          },
          borderRadius: [4, 4, 0, 0],
        },
        label: {
          show: true,
          position: 'top',
          color: '#cde8fa',
          fontSize: 10,
          fontWeight: 600,
          formatter: (p) => `${p.value}%`,
        },
        markLine: {
          silent: true,
          lineStyle: { color: '#ff9500', type: 'dashed', width: 1.5 },
          data: [{ yAxis: 85, label: { color: '#ff9500', fontSize: 9, formatter: '目标线 85%' } }],
        },
      },
      {
        name: 'MAE',
        type: 'line',
        yAxisIndex: 1,
        data: maeData,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#ffd700', width: 1.5 },
        itemStyle: { color: '#ffd700' },
      },
      {
        name: 'RMSE',
        type: 'line',
        yAxisIndex: 1,
        data: rmseData,
        symbol: 'diamond',
        symbolSize: 6,
        lineStyle: { color: '#ff6b9d', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#ff6b9d' },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// CHART 5: Weekly Congestion Heatmap
// ============================================================
function CongestionHeatmap() {
  const { days, data } = WEEKLY_HEATMAP;
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: (params) => {
        const level = params.value[2];
        const label = level > 0.8 ? '严重拥堵' : level > 0.65 ? '重度拥堵' :
          level > 0.5 ? '中度拥堵' : level > 0.35 ? '轻度拥堵' : '畅通';
        return `${days[params.value[1]]} ${hours[params.value[0]]}<br/>拥堵强度: ${(level * 100).toFixed(0)}%<br/>${label}`;
      },
    },
    grid: { top: 28, bottom: 30, left: 45, right: 60 },
    xAxis: {
      type: 'category',
      data: hours,
      splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(0,195,255,0.02)'] } },
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 8, interval: 3 },
    },
    yAxis: {
      type: 'category',
      data: days,
      splitArea: { show: true, areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(0,195,255,0.02)'] } },
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(200,230,250,0.6)', fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
      inRange: {
        color: ['#0a1628', '#00c3ff44', '#ffc80088', '#ff5a0099', '#ff1e1e'],
      },
      itemWidth: 12,
      itemHeight: 100,
    },
    series: [{
      type: 'heatmap',
      data: data,
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: '#00c3ff' },
      },
    }],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// CHART 6: Data Processing Stats
// ============================================================
function DataStatsChart() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
    },
    legend: {
      data: ['原始记录(千)', '清洗后记录(千)', '异常记录(百)'],
      top: 0,
      right: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
    },
    grid: { top: 30, bottom: 32, left: 45, right: 20 },
    xAxis: {
      type: 'category',
      data: ['PEMS03', 'PEMS04', 'PEMS07', 'PEMS08'],
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: {
        color: (v) => ({PEMS03:'#00c3ff', PEMS04:'#39ff6a', PEMS07:'#ff9500', PEMS08:'#b24bff'}[v]),
        fontSize: 11,
        fontWeight: 600,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
    },
    series: [
      {
        name: '原始记录(千)',
        type: 'bar',
        data: [26.208, 16.992, 28.224, 17.856],
        barWidth: 18,
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#00c3ff' }, { offset: 1, color: '#00c3ff33' }]
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: '清洗后记录(千)',
        type: 'bar',
        data: [
          26.208 * 0.992, 16.992 * 0.993,
          28.224 * 0.988, 17.856 * 0.993,
        ].map(v => +v.toFixed(3)),
        barWidth: 18,
        barGap: '20%',
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#39ff6a' }, { offset: 1, color: '#39ff6a33' }]
          },
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: '异常记录(百)',
        type: 'line',
        data: [
          +(26.208 * 0.008 * 10).toFixed(2),
          +(16.992 * 0.007 * 10).toFixed(2),
          +(28.224 * 0.012 * 10).toFixed(2),
          +(17.856 * 0.007 * 10).toFixed(2),
        ],
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#ff9500', width: 2 },
        itemStyle: { color: '#ff9500' },
        yAxisIndex: 0,
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// DATASET OVERVIEW CARDS
// ============================================================
function DatasetOverviewCards({ selected, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {Object.entries(PEMS_DATASETS).map(([key, ds]) => (
        <div
          key={key}
          onClick={() => onSelect(key)}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: selected === key ? `rgba(${ds.color.join(',')},0.1)` : 'rgba(0,195,255,0.04)',
            border: `1px solid ${selected === key ? `rgba(${ds.color.join(',')},0.5)` : 'rgba(0,195,255,0.12)'}`,
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: selected === key ? `rgb(${ds.color.join(',')})` : 'transparent',
            opacity: 0.8 }} />
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: `rgb(${ds.color.join(',')})`,
            marginBottom: 4,
            textShadow: selected === key ? `0 0 8px rgba(${ds.color.join(',')},0.6)` : 'none',
          }}>
            {key}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{ds.nameEn}</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ color: `rgb(${ds.color.join(',')})`, fontFamily: 'var(--font-num)', fontWeight: 700 }}>
              {ds.sensors}
            </span>
            <span>传感器</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-num)' }}>{(ds.records / 1000).toFixed(1)}K</span>
            <span>记录</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>{ds.period}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CONGESTION TYPE STACKED BAR
// ============================================================
function CongestionTypeBar() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
    },
    legend: {
      data: ['常发性', '偶发性', '施工影响', '天气影响'],
      bottom: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
    },
    grid: { top: 12, bottom: 32, left: 60, right: 20 },
    xAxis: {
      type: 'value',
      max: 100,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9, formatter: '{value}%' },
    },
    yAxis: {
      type: 'category',
      data: ['PEMS03', 'PEMS04', 'PEMS07', 'PEMS08'],
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: {
        color: (v) => ({ PEMS03: '#00c3ff', PEMS04: '#39ff6a', PEMS07: '#ff9500', PEMS08: '#b24bff' }[v]),
        fontSize: 11,
        fontWeight: 600,
      },
    },
    series: [
      {
        name: '常发性',
        type: 'bar',
        stack: 'total',
        data: [68.3, 64.8, 71.2, 66.5],
        barWidth: 16,
        itemStyle: { color: 'rgba(255,30,30,0.75)', borderRadius: [0, 0, 0, 0] },
        label: { show: true, color: '#fff', fontSize: 9, formatter: '{c}%' },
      },
      {
        name: '偶发性',
        type: 'bar',
        stack: 'total',
        data: [22.4, 27.6, 19.8, 24.3],
        itemStyle: { color: 'rgba(255,149,0,0.75)' },
        label: { show: true, color: '#fff', fontSize: 9, formatter: '{c}%' },
      },
      {
        name: '施工影响',
        type: 'bar',
        stack: 'total',
        data: [6.2, 5.4, 6.8, 7.1],
        itemStyle: { color: 'rgba(255,200,0,0.75)' },
      },
      {
        name: '天气影响',
        type: 'bar',
        stack: 'total',
        data: [3.1, 2.2, 2.2, 2.1],
        itemStyle: { color: 'rgba(0,195,255,0.6)', borderRadius: [0, 3, 3, 0] },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// PREDICTION MULTI-HORIZON LINE
// ============================================================
function PredictionHorizonLine({ dataset }) {
  const realData = HOURLY_DATA[dataset]?.flow || HOURLY_DATA.PEMS03.flow;
  const pred15 = HOURLY_DATA[dataset]?.predicted_flow || HOURLY_DATA.PEMS03.predicted_flow;
  // Simulate 30min and 60min predictions (slightly less accurate)
  const pred30 = pred15.map((v, i) => Math.round(v + (Math.sin(i * 0.8) * 80)));
  const pred60 = pred15.map((v, i) => Math.round(v + (Math.sin(i * 1.2) * 140)));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
    },
    legend: {
      data: ['实际', '预测15min', '预测30min', '预测60min'],
      top: 0,
      right: 0,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 8,
    },
    grid: { top: 30, bottom: 28, left: 45, right: 20 },
    xAxis: {
      type: 'category',
      data: HOURLY_DATA.hours,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9, interval: 3 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.07)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.5)', fontSize: 9 },
    },
    series: [
      {
        name: '实际',
        type: 'line',
        data: realData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00c3ff', width: 2.5 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#00c3ff28' }, { offset: 1, color: '#00c3ff04' }]
        }},
      },
      {
        name: '预测15min',
        type: 'line',
        data: pred15,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#39ff6a', width: 1.5, type: 'dashed' },
      },
      {
        name: '预测30min',
        type: 'line',
        data: pred30,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#ff9500', width: 1.5, type: 'dashed' },
      },
      {
        name: '预测60min',
        type: 'line',
        data: pred60,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#ff3b3b', width: 1.5, type: 'dotted' },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

// ============================================================
// MAIN DATA VIZ PAGE
// ============================================================
export default function DataViz() {
  const [selectedDataset, setSelectedDataset] = useState('PEMS03');
  const [flowMetric, setFlowMetric] = useState('flow');
  const [horizonMetric, setHorizonMetric] = useState('15分钟');

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px 12px',
      gap: 10,
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Dataset overview cards */}
      <DatasetOverviewCards selected={selectedDataset} onSelect={setSelectedDataset} />

      {/* Charts grid - Row 1 */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, minHeight: 0 }}>
        <ChartPanel
          title="多数据集流量/速度对比"
          subtitle="24小时时序"
          controls={
            <SegmentGroup
              options={[
                { value: 'flow', label: '流量' },
                { value: 'speed', label: '速度' },
              ]}
              value={flowMetric}
              onChange={setFlowMetric}
            />
          }
        >
          <FlowComparisonChart metric={flowMetric} />
        </ChartPanel>

        <ChartPanel
          title="速度-流量关系"
          subtitle={`基本图 · ${selectedDataset}`}
        >
          <SpeedFlowScatter dataset={selectedDataset} />
        </ChartPanel>

        <ChartPanel
          title="PEMS数据集特征雷达"
          subtitle="多维度综合对比"
        >
          <SensorRadarChart />
        </ChartPanel>
      </div>

      {/* Charts grid - Row 2 */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, minHeight: 0 }}>
        <ChartPanel
          title="STGNN 预测精度评估"
          subtitle="多数据集对比"
          controls={
            <SegmentGroup
              options={[
                { value: '15分钟', label: '15min' },
                { value: '30分钟', label: '30min' },
                { value: '60分钟', label: '60min' },
              ]}
              value={horizonMetric}
              onChange={setHorizonMetric}
            />
          }
        >
          <AccuracyChart horizon={horizonMetric} />
        </ChartPanel>

        <ChartPanel
          title="周拥堵强度热力图"
          subtitle="全周 24小时分布"
        >
          <CongestionHeatmap />
        </ChartPanel>

        <ChartPanel
          title="拥堵成因分类分布"
          subtitle="常发 vs 偶发"
        >
          <CongestionTypeBar />
        </ChartPanel>
      </div>
    </div>
  );
}
