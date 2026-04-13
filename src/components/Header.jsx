import { useState, useEffect } from 'react';
import { REAL_TIME_KPI } from '../data/trafficData';

// ============================================================
// SYSTEM HEADER COMPONENT
// Industrial-style header with real-time status indicators
// ============================================================

const BASE_TABS = [
  {
    id: 'dashboard',
    label: '智慧大屏',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'dataviz',
    label: '数据可视化',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: 'agent',
    label: 'Agent 控制中心',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M8 12h8M12 8v8" />
        <circle cx="8" cy="12" r="1.5" fill="currentColor" />
        <circle cx="16" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="8" r="1.5" fill="currentColor" />
        <circle cx="12" cy="16" r="1.5" fill="currentColor" />
      </svg>
    ),
    highlight: true,
  },
];

function useRealTimeClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

function formatTime(date) {
  return date.toTimeString().slice(0, 8);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${y}-${m}-${d} ${days[date.getDay()]}`;
}

function StatusPill({ label, value, unit, color = 'blue', pulse = false }) {
  const colorMap = {
    blue: { bg: 'rgba(0,195,255,0.08)', border: 'rgba(0,195,255,0.3)', text: '#00c3ff' },
    green: { bg: 'rgba(57,255,106,0.08)', border: 'rgba(57,255,106,0.3)', text: '#39ff6a' },
    orange: { bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.3)', text: '#ff9500' },
    red: { bg: 'rgba(255,59,59,0.08)', border: 'rgba(255,59,59,0.3)', text: '#ff3b3b' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 4,
      minWidth: 90,
    }}>
      {pulse && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: c.text,
          boxShadow: `0 0 8px ${c.text}`,
          animation: 'breathe 2s ease-in-out infinite',
          flexShrink: 0,
        }} />
      )}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{
        fontSize: 13,
        fontFamily: 'var(--font-num)',
        fontWeight: 700,
        color: c.text,
        textShadow: `0 0 8px ${c.text}55`,
      }}>{value}</span>
      {unit && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unit}</span>}
    </div>
  );
}

export default function Header({ activeTab, onTabChange, enableExternalMonitor = false }) {
  const time = useRealTimeClock();
  const [kpi, setKpi] = useState(REAL_TIME_KPI);
  const tabs = enableExternalMonitor
    ? [
        ...BASE_TABS,
        {
          id: 'external-monitor',
          label: '抓取监控',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h5l2 5 4-10 2 5h5" />
              <circle cx="6" cy="6" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          ),
        },
      ]
    : BASE_TABS;

  // Simulate real-time KPI updates
  useEffect(() => {
    const timer = setInterval(() => {
      setKpi(prev => ({
        ...prev,
        tpi: parseFloat((prev.tpi + (Math.random() - 0.5) * 0.08).toFixed(1)),
        avgSpeed: parseFloat((prev.avgSpeed + (Math.random() - 0.5) * 0.5).toFixed(1)),
        congestionRatio: parseFloat((prev.congestionRatio + (Math.random() - 0.5) * 0.2).toFixed(1)),
        activeVehicles: prev.activeVehicles + Math.floor((Math.random() - 0.5) * 500),
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const getTpiColor = (tpi) => {
    if (tpi >= 8) return 'red';
    if (tpi >= 6) return 'orange';
    if (tpi >= 4) return 'blue';
    return 'green';
  };

  return (
    <header style={{
      flexShrink: 0,
      background: 'rgba(10, 22, 40, 0.98)',
      borderBottom: '1px solid rgba(0, 195, 255, 0.2)',
      position: 'relative',
      zIndex: 100,
      backdropFilter: 'blur(10px)',
    }}>
      {/* Top glow line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 0%, #00c3ff 20%, #00ffc8 50%, #00c3ff 80%, transparent 100%)',
        opacity: 0.8,
      }} />

      {/* Main header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        height: 52,
        gap: 20,
      }}>
        {/* Logo + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Animated logo */}
          <div style={{ position: 'relative', width: 32, height: 32 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="rgba(0,195,255,0.4)" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="10" stroke="rgba(0,195,255,0.6)" strokeWidth="1.5"
                strokeDasharray="4 2" style={{ animation: 'spin 8s linear infinite', transformOrigin: 'center' }} />
              <circle cx="16" cy="16" r="6" stroke="#00c3ff" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="2.5" fill="#00c3ff" style={{ filter: 'drop-shadow(0 0 4px #00c3ff)' }} />
              <line x1="16" y1="2" x2="16" y2="30" stroke="rgba(0,195,255,0.2)" strokeWidth="0.5" />
              <line x1="2" y1="16" x2="30" y2="16" stroke="rgba(0,195,255,0.2)" strokeWidth="0.5" />
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#00c3ff',
              letterSpacing: '0.05em',
              textShadow: '0 0 12px rgba(0,195,255,0.6)',
              lineHeight: 1.2,
            }}>
              城市路网智能决策系统
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              URBAN TRAFFIC AI v2.0 · PEMS ANALYTICS
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Tab Navigation */}
        <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: activeTab === tab.id
                  ? (tab.highlight ? 'rgba(0,255,200,0.12)' : 'rgba(0,195,255,0.15)')
                  : tab.highlight ? 'rgba(0,255,200,0.04)' : 'transparent',
                border: `1px solid ${activeTab === tab.id
                  ? (tab.highlight ? 'rgba(0,255,200,0.7)' : 'rgba(0,195,255,0.6)')
                  : tab.highlight ? 'rgba(0,255,200,0.25)' : 'rgba(0,195,255,0.12)'}`,
                borderRadius: 4,
                color: activeTab === tab.id
                  ? (tab.highlight ? '#00ffc8' : '#00c3ff')
                  : tab.highlight ? 'rgba(0,255,200,0.7)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: 'var(--font-sans)',
                boxShadow: activeTab === tab.id
                  ? (tab.highlight ? '0 0 14px rgba(0,255,200,0.3)' : '0 0 12px rgba(0,195,255,0.25)')
                  : 'none',
                letterSpacing: '0.03em',
                position: 'relative',
              }}
            >
              <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Real-time KPI Pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
          <StatusPill
            label="TPI"
            value={kpi.tpi.toFixed(1)}
            color={getTpiColor(kpi.tpi)}
            pulse
          />
          <StatusPill
            label="均速"
            value={kpi.avgSpeed.toFixed(1)}
            unit="km/h"
            color="blue"
          />
          <StatusPill
            label="拥堵率"
            value={kpi.congestionRatio.toFixed(1)}
            unit="%"
            color={kpi.congestionRatio > 35 ? 'red' : kpi.congestionRatio > 25 ? 'orange' : 'green'}
          />
          <StatusPill
            label="在途车辆"
            value={(kpi.activeVehicles / 10000).toFixed(1) + 'W'}
            color="blue"
          />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Clock */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
          <div style={{
            fontSize: 16,
            fontFamily: 'var(--font-num)',
            fontWeight: 700,
            color: '#00c3ff',
            textShadow: '0 0 8px rgba(0,195,255,0.5)',
            letterSpacing: '0.08em',
            lineHeight: 1.2,
          }}>
            {formatTime(time)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {formatDate(time)}
          </div>
        </div>

        {/* System status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          background: 'rgba(57,255,106,0.06)',
          border: '1px solid rgba(57,255,106,0.25)',
          borderRadius: 4,
          flexShrink: 0,
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#39ff6a',
            boxShadow: '0 0 8px rgba(57,255,106,0.8)',
            animation: 'breathe 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, color: '#39ff6a', fontWeight: 500 }}>系统正常</span>
        </div>
      </div>

      {/* Data source status bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(0,195,255,0.02)',
        padding: '4px 20px',
        alignItems: 'center',
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: '0.04em',
        overflow: 'hidden',
      }}>
        <span style={{ flexShrink: 0, color: 'var(--text-muted)', marginRight: 10 }}>数据源:</span>
        {[
          { name: 'PEMS03·洛杉矶', count: 358, color: '#00c3ff', status: 'online' },
          { name: 'PEMS04·旧金山湾区', count: 307, color: '#39ff6a', status: 'online' },
          { name: 'PEMS07·加州第七区', count: 883, color: '#ff9500', status: 'online' },
          { name: 'PEMS08·圣贝纳迪诺', count: 170, color: '#b24bff', status: 'online' },
        ].map((ds, i) => (
          <span key={ds.name} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            paddingRight: 16,
            borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none',
            marginRight: 16,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: ds.color,
              boxShadow: `0 0 5px ${ds.color}`,
            }} />
            <span style={{ color: ds.color, fontWeight: 500 }}>{ds.name}</span>
            <span>{ds.count}传感器</span>
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ color: '#39ff6a' }}>STGNN 模型推理中</span>
        <span style={{ margin: '0 10px', color: 'var(--border-subtle)' }}>|</span>
        <span>数据刷新延迟 &lt;3s</span>
        <span style={{ margin: '0 10px', color: 'var(--border-subtle)' }}>|</span>
        <span>数据质量 {REAL_TIME_KPI.dataQuality}%</span>
        <span style={{ margin: '0 10px', color: 'var(--border-subtle)' }}>|</span>
        <span>系统负载 {REAL_TIME_KPI.systemLoad}%</span>
      </div>
    </header>
  );
}
