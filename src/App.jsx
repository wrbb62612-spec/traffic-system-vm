import { useState, Suspense, lazy } from 'react';
import Header from './components/Header.jsx';

// Lazy load page components for better performance
const Dashboard = lazy(() => import('./pages/Dashboard/index.jsx'));
const DataViz = lazy(() => import('./pages/DataViz/index.jsx'));
const AgentSystem = lazy(() => import('./pages/AgentSystem/index.jsx'));
const ExternalMonitor = lazy(() => import('./pages/ExternalMonitor/index.jsx'));

// 后期要关掉抓取监控页时，把这里改成 false 即可。
const ENABLE_EXTERNAL_MONITOR = true;

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Animated loading spinner */}
      <div style={{ position: 'relative', width: 60, height: 60 }}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <circle cx="30" cy="30" r="26" stroke="rgba(0,195,255,0.15)" strokeWidth="2" />
          <circle
            cx="30" cy="30" r="26"
            stroke="#00c3ff"
            strokeWidth="2"
            strokeDasharray="40 125"
            strokeLinecap="round"
            style={{ animation: 'spin 1.2s linear infinite', transformOrigin: 'center' }}
          />
          <circle
            cx="30" cy="30" r="18"
            stroke="rgba(0,255,200,0.4)"
            strokeWidth="1.5"
            strokeDasharray="25 90"
            strokeLinecap="round"
            style={{ animation: 'spin-reverse 1.8s linear infinite', transformOrigin: 'center' }}
          />
          <circle cx="30" cy="30" r="4" fill="#00c3ff" style={{ filter: 'drop-shadow(0 0 6px #00c3ff)' }} />
        </svg>
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        正在加载模块...
      </div>
      <div style={{
        width: 200,
        height: 2,
        background: 'rgba(0,195,255,0.1)',
        borderRadius: 1,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #00c3ff, #00ffc8)',
          borderRadius: 1,
          animation: 'skeleton-wave 1.5s infinite',
          backgroundSize: '200% 100%',
        }} />
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="sys-layout">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        enableExternalMonitor={ENABLE_EXTERNAL_MONITOR}
      />
      <main className="content-area" style={{ position: 'relative', zIndex: 1 }}>
        <Suspense fallback={<PageLoader />}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'dataviz' && <DataViz />}
          {activeTab === 'agent' && <AgentSystem />}
          {ENABLE_EXTERNAL_MONITOR && activeTab === 'external-monitor' && <ExternalMonitor />}
        </Suspense>
      </main>
    </div>
  );
}
