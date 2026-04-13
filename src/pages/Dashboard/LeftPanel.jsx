import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { HOURLY_DATA, CONGESTION_EVENTS, REAL_TIME_KPI } from '../../data/trafficData';

// ============================================================
// LEFT PANEL - Dashboard Left Sidebar
// TPI gauge, data source status, congestion analysis
// ============================================================

// Animated number component
function AnimatedNumber({ value, decimals = 0, suffix = '' }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const duration = 600;
    const startTime = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplayed(current);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    prevRef.current = value;
  }, [value]);
  return <>{displayed.toFixed(decimals)}{suffix}</>;
}

// TPI Gauge Chart
function TPIGauge({ tpi }) {
  const getColor = (v) => v >= 8 ? '#ff3b3b' : v >= 6 ? '#ff9500' : v >= 4 ? '#00c3ff' : '#39ff6a';
  const option = {
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      radius: '88%',
      center: ['50%', '58%'],
      min: 0,
      max: 10,
      splitNumber: 5,
      axisLine: {
        lineStyle: {
          width: 16,
          color: [
            [0.3, '#39ff6a'],
            [0.5, '#00c3ff'],
            [0.7, '#ff9500'],
            [1.0, '#ff3b3b'],
          ],
        },
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '60%',
        width: 10,
        offsetCenter: [0, '-55%'],
        itemStyle: {
          color: getColor(tpi),
          shadowColor: getColor(tpi),
          shadowBlur: 10,
        },
      },
      axisTick: {
        length: 8,
        lineStyle: { color: 'rgba(0,195,255,0.4)', width: 1 },
      },
      splitLine: {
        length: 18,
        lineStyle: { color: 'rgba(0,195,255,0.6)', width: 2 },
      },
      axisLabel: {
        color: 'rgba(200,230,250,0.6)',
        fontSize: 9,
        distance: -40,
      },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '15%'],
        fontSize: 28,
        fontWeight: 'bold',
        fontFamily: 'Consolas, Monaco, monospace',
        color: getColor(tpi),
        formatter: (v) => v.toFixed(1),
        textShadowColor: getColor(tpi),
        textShadowBlur: 12,
      },
      title: {
        offsetCenter: [0, '45%'],
        fontSize: 10,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
      },
      data: [{ value: tpi, name: '交通运行指数' }],
    }],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}

// Congestion Type Pie Chart (Nightingale Rose)
function CongestionPie() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 11 },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: 'rgba(200,230,250,0.7)', fontSize: 10 },
    },
    series: [{
      type: 'pie',
      radius: ['35%', '70%'],
      center: ['50%', '45%'],
      roseType: 'area',
      data: [
        { name: '严重拥堵', value: 15.2, itemStyle: { color: '#ff1e1e' } },
        { name: '重度拥堵', value: 22.8, itemStyle: { color: '#ff5a00' } },
        { name: '中度拥堵', value: 28.6, itemStyle: { color: '#ffc800' } },
        { name: '轻微拥堵', value: 18.3, itemStyle: { color: '#64dc64' } },
        { name: '畅通', value: 15.1, itemStyle: { color: '#00c3ff' } },
      ],
      label: {
        color: 'rgba(200,230,250,0.8)',
        fontSize: 10,
        formatter: '{b}\n{d}%',
      },
      labelLine: {
        lineStyle: { color: 'rgba(0,195,255,0.3)' },
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 20,
          shadowColor: 'rgba(0,195,255,0.5)',
        },
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

// Real-time flow sparkline
function FlowSparkline({ dataset = 'PEMS03' }) {
  const data = HOURLY_DATA[dataset];
  const option = {
    backgroundColor: 'transparent',
    grid: { top: 8, bottom: 20, left: 30, right: 10 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12,26,48,0.95)',
      borderColor: 'rgba(0,195,255,0.4)',
      textStyle: { color: '#cde8fa', fontSize: 10 },
      formatter: (params) => `${params[0].name}<br/>流量: ${params[0].value} 辆/5min<br/>预测: ${params[1]?.value} 辆/5min`,
    },
    xAxis: {
      type: 'category',
      data: HOURLY_DATA.hours,
      axisLine: { lineStyle: { color: 'rgba(0,195,255,0.2)' } },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(200,230,250,0.4)',
        fontSize: 9,
        interval: 5,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,195,255,0.08)', type: 'dashed' } },
      axisLabel: { color: 'rgba(200,230,250,0.4)', fontSize: 9 },
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.flow,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00c3ff', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,195,255,0.25)' },
              { offset: 1, color: 'rgba(0,195,255,0.02)' },
            ],
          },
        },
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted_flow,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#ff9500', width: 1.5, type: 'dashed' },
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

// Data Source Status List
function DataSourceStatus() {
  const sources = [
    { name: 'PEMS03 传感器网络', region: '洛杉矶', count: 358, quality: 98.4, delay: 2.1, status: 'online', color: '#00c3ff' },
    { name: 'PEMS04 传感器网络', region: '旧金山湾区', count: 307, quality: 99.1, delay: 1.8, status: 'online', color: '#39ff6a' },
    { name: 'PEMS07 传感器网络', region: '加州第七区', count: 883, quality: 97.6, delay: 2.4, status: 'online', color: '#ff9500' },
    { name: 'PEMS08 传感器网络', region: '圣贝纳迪诺', count: 170, quality: 98.8, delay: 1.5, status: 'online', color: '#b24bff' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sources.map((src) => (
        <div key={src.name} style={{
          padding: '7px 10px',
          background: 'rgba(0,195,255,0.04)',
          border: '1px solid rgba(0,195,255,0.1)',
          borderRadius: 4,
          borderLeft: `3px solid ${src.color}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#39ff6a',
                boxShadow: '0 0 6px rgba(57,255,106,0.8)',
                animation: 'breathe 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>{src.name}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              延迟 {src.delay}s
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 3, background: 'rgba(0,195,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${src.quality}%`, height: '100%',
                  background: `linear-gradient(90deg, ${src.color}, ${src.color}88)`,
                  borderRadius: 2,
                }} />
              </div>
            </div>
            <span style={{ fontSize: 10, color: src.color, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {src.quality}%
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
              {src.count}传感器
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Congestion Event List
function CongestionEventList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {CONGESTION_EVENTS.slice(0, 4).map((event) => (
        <div key={event.id} style={{
          padding: '6px 8px',
          background: event.severity === 'severe' ? 'rgba(255,30,30,0.06)' :
            event.severity === 'heavy' ? 'rgba(255,90,0,0.06)' :
              'rgba(255,200,0,0.06)',
          border: `1px solid ${event.severity === 'severe' ? 'rgba(255,30,30,0.2)' :
            event.severity === 'heavy' ? 'rgba(255,90,0,0.2)' :
              'rgba(255,200,0,0.2)'}`,
          borderRadius: 4,
          fontSize: 11,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {event.location}
            </span>
            <span style={{
              fontSize: 10, flexShrink: 0, marginLeft: 8,
              color: event.severity === 'severe' ? '#ff3b3b' :
                event.severity === 'heavy' ? '#ff9500' : '#ffd700',
            }}>
              {event.type === '常发性拥堵' ? '常发' : '偶发'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, color: 'var(--text-muted)', fontSize: 10 }}>
            <span>{event.startTime}-{event.endTime}</span>
            <span>速降 {event.speedDrop}km/h</span>
            <span>{event.dataset}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MAIN LEFT PANEL EXPORT
// ============================================================
export default function LeftPanel({ timeOffset }) {
  const [tpi, setTpi] = useState(REAL_TIME_KPI.tpi);
  const [kpi, setKpi] = useState(REAL_TIME_KPI);
  const [selectedDataset, setSelectedDataset] = useState('PEMS03');

  useEffect(() => {
    const timer = setInterval(() => {
      setTpi(prev => {
        const next = prev + (Math.random() - 0.5) * 0.1;
        return parseFloat(Math.max(3, Math.min(9.5, next)).toFixed(1));
      });
      setKpi(prev => ({
        ...prev,
        avgSpeed: Math.max(20, Math.min(75, prev.avgSpeed + (Math.random() - 0.5) * 0.5)),
        congestionRatio: Math.max(15, Math.min(50, prev.congestionRatio + (Math.random() - 0.5) * 0.3)),
        incidentCount: Math.max(0, Math.min(8, prev.incidentCount + (Math.random() > 0.95 ? 1 : Math.random() > 0.95 ? -1 : 0))),
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

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

      {/* TPI Gauge */}
      <div className="panel panel-corner" style={{ flexShrink: 0, height: 160 }}>
        <div className="panel-header">
          <span className="panel-title">交通运行指数 TPI</span>
          <span style={{
            marginLeft: 'auto', fontSize: 10,
            color: tpi >= 8 ? '#ff3b3b' : tpi >= 6 ? '#ff9500' : '#39ff6a',
            fontWeight: 600,
          }}>
            {tpi >= 8 ? '严重拥堵' : tpi >= 6 ? '拥堵' : tpi >= 4 ? '缓行' : '畅通'}
          </span>
        </div>
        <div style={{ height: 130, padding: '0 8px' }}>
          <TPIGauge tpi={tpi} />
        </div>
      </div>

      {/* Quick KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, flexShrink: 0 }}>
        {[
          { label: '路网均速', value: kpi.avgSpeed.toFixed(1), unit: 'km/h', color: '#00c3ff' },
          { label: '拥堵比例', value: kpi.congestionRatio.toFixed(1), unit: '%', color: kpi.congestionRatio > 35 ? '#ff3b3b' : '#ff9500' },
          { label: '事件告警', value: kpi.incidentCount, unit: '起', color: kpi.incidentCount > 3 ? '#ff3b3b' : '#ff9500' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'rgba(0,195,255,0.05)',
            border: '1px solid rgba(0,195,255,0.12)',
            borderRadius: 4,
            padding: '6px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-num)', fontWeight: 700, color: item.color, textShadow: `0 0 8px ${item.color}55` }}>
              {item.value}<span style={{ fontSize: 9, marginLeft: 2 }}>{item.unit}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Dataset selector for flow chart */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
        {['PEMS03', 'PEMS04', 'PEMS07', 'PEMS08'].map(ds => (
          <button
            key={ds}
            onClick={() => setSelectedDataset(ds)}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              background: selectedDataset === ds ? 'rgba(0,195,255,0.15)' : 'transparent',
              border: `1px solid ${selectedDataset === ds ? 'rgba(0,195,255,0.5)' : 'rgba(0,195,255,0.15)'}`,
              borderRadius: 3,
              color: selectedDataset === ds ? '#00c3ff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.2s',
            }}
          >
            {ds}
          </button>
        ))}
      </div>

      {/* Flow sparkline */}
      <div className="panel" style={{ flexShrink: 0, height: 130 }}>
        <div className="panel-header">
          <span className="panel-title">流量时序 · {selectedDataset}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>实际 vs 预测</span>
        </div>
        <div style={{ height: 96 }}>
          <FlowSparkline dataset={selectedDataset} />
        </div>
      </div>

      {/* Congestion pie */}
      <div className="panel" style={{ flexShrink: 0, height: 180 }}>
        <div className="panel-header">
          <span className="panel-title">拥堵类型分布</span>
        </div>
        <div style={{ height: 148 }}>
          <CongestionPie />
        </div>
      </div>

      {/* Data source status */}
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">数据源接入状态</span>
          <span style={{ marginLeft: 'auto' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#39ff6a', display: 'inline-block', marginRight: 4 }} />
            <span style={{ fontSize: 10, color: '#39ff6a' }}>4/4 在线</span>
          </span>
        </div>
        <div className="panel-body">
          <DataSourceStatus />
        </div>
      </div>

      {/* Event list */}
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">近期拥堵事件</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-orange)' }}>
            {CONGESTION_EVENTS.length} 起
          </span>
        </div>
        <div className="panel-body">
          <CongestionEventList />
        </div>
      </div>
    </div>
  );
}
