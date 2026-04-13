import { useCallback, useEffect, useMemo, useState } from 'react';

const BACKEND_URL = 'http://localhost:8000';

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function DataSummary({ data }) {
  const weatherAlerts = data?.weather?.alerts?.length ?? 0;
  const holidayToday = data?.holiday?.today?.length ?? 0;
  const eventsCount = data?.events?.count ?? 0;
  const poiCount = data?.poi?.count ?? 0;
  const incidentsCount = data?.incidents?.count ?? 0;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {[
        { label: '天气预警', value: weatherAlerts },
        { label: '节假日命中', value: holidayToday > 0 ? '是' : '否' },
        { label: '活动数', value: eventsCount },
        { label: 'POI数', value: poiCount },
        { label: '事件数', value: incidentsCount },
      ].map((it) => (
        <div key={it.label} className="stat-card" style={{ minWidth: 110 }}>
          <div className="data-label">{it.label}</div>
          <div className="data-value small">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function ExternalMonitor() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/external/snapshots?limit=30`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = json.items || [];
      setItems(rows);
      if (!selectedId && rows.length) setSelectedId(rows[0].id);
    } catch (e) {
      setError(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const collectNow = useCallback(async () => {
    setCollecting(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/external/collect/default`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadSnapshots();
    } catch (e) {
      setError(`抓取失败: ${e.message}`);
    } finally {
      setCollecting(false);
    }
  }, [loadSnapshots]);

  useEffect(() => {
    loadSnapshots();
    const timer = setInterval(loadSnapshots, 15000);
    return () => clearInterval(timer);
  }, [loadSnapshots]);

  return (
    <div style={{ width: '100%', height: '100%', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">外部数据抓取监控</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={loadSnapshots} disabled={loading}>
              {loading ? '刷新中...' : '刷新'}
            </button>
            <button className="btn btn-primary" onClick={collectNow} disabled={collecting}>
              {collecting ? '抓取中...' : '立即抓取'}
            </button>
          </div>
        </div>
        <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          后端接口: <span className="text-accent">{BACKEND_URL}/external/snapshots</span>
          {error && <div style={{ marginTop: 8, color: 'var(--text-danger)' }}>{error}</div>}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 10 }}>
        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <span className="panel-title">快照列表</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>共 {items.length} 条</span>
          </div>
          <div className="scroll-panel" style={{ flex: 1, padding: 8 }}>
            {items.map((row) => (
              <button
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 6,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${selected?.id === row.id ? 'rgba(0,195,255,0.6)' : 'rgba(0,195,255,0.15)'}`,
                  background: selected?.id === row.id ? 'rgba(0,195,255,0.12)' : 'rgba(0,195,255,0.04)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 12, color: '#00c3ff', fontWeight: 600 }}>#{row.id} {row.city}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDate(row.fetched_at)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  ({row.lat}, {row.lon}) · providers: {(row.providers || []).join(', ')}
                </div>
              </button>
            ))}
            {!items.length && !loading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>暂无数据，点击“立即抓取”创建首条快照。</div>
            )}
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <span className="panel-title">快照详情</span>
            {selected && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                ID #{selected.id} · {fmtDate(selected.fetched_at)}
              </span>
            )}
          </div>
          <div className="scroll-panel" style={{ flex: 1, padding: 10 }}>
            {!selected ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>请选择左侧一条快照。</div>
            ) : (
              <>
                <DataSummary data={selected.data || {}} />
                <div className="divider" />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>异常信息</div>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0,195,255,0.04)',
                  border: '1px solid rgba(0,195,255,0.15)',
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}>
                  {JSON.stringify({ issues: selected.issues, missing_credentials: selected.missing_credentials }, null, 2)}
                </pre>
                <div className="divider" />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>原始数据</div>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0,195,255,0.04)',
                  border: '1px solid rgba(0,195,255,0.15)',
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  maxHeight: 420,
                  overflow: 'auto',
                }}>
                  {JSON.stringify(selected.data, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
