import { useCallback, useEffect, useState } from "react";
import { getCurrentFeature, getHistoryFeature } from "../api/datastore";

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "--";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toFixed(digits);
}

function formatText(value) {
  if (value === null || value === undefined || value === "") return "--";
  return String(value);
}

function StatCard({ label, value, unit }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        background: "rgba(0,195,255,0.05)",
        border: "1px solid rgba(0,195,255,0.12)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          color: "#8fe7ff",
          fontFamily: "var(--font-num)",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        {value}
        {unit ? <span style={{ fontSize: 11, marginLeft: 4 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

export default function RealtimeNodeFeaturePanel({ initialNodeId = "1001" }) {
  const [nodeId, setNodeId] = useState(initialNodeId);
  const [steps, setSteps] = useState(6);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [currentRes, historyRes] = await Promise.all([
        getCurrentFeature(nodeId),
        getHistoryFeature(nodeId, steps),
      ]);
      setCurrent(currentRes?.data || null);
      setHistory(historyRes?.data || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId, steps]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      loadData();
    }, 8000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadData]);

  return (
    <div className="panel" style={{ flexShrink: 0 }}>
      <div className="panel-header">
        <span className="panel-title">实时节点特征</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: autoRefresh ? "#39ff6a" : "var(--text-muted)",
          }}
        >
          {autoRefresh ? "自动刷新中" : "手动刷新"}
        </span>
      </div>

      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            placeholder="node id"
            style={{ width: 72 }}
          />
          <input
            type="number"
            min={1}
            max={12}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value) || 1)}
            placeholder="steps"
            style={{ width: 70 }}
          />
          <button onClick={loadData} style={{ cursor: "pointer" }}>
            {loading ? "加载中..." : "刷新"}
          </button>
          <label
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>
        </div>

        {error ? <div style={{ color: "#ff6b6b", fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatCard label="平均速度" value={formatNumber(current?.speed)} unit="km/h" />
          <StatCard label="流量" value={formatNumber(current?.flow)} unit="veh" />
          <StatCard label="占有率" value={formatNumber(current?.occupancy, 3)} />
          <StatCard label="样本数" value={formatText(current?.sample_count)} />
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: "rgba(0,195,255,0.04)",
            border: "1px solid rgba(0,195,255,0.1)",
            fontSize: 11,
            color: "var(--text-secondary)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          <div>节点 ID：{formatText(current?.node_id || nodeId)}</div>
          <div>time_of_day：{formatNumber(current?.time_of_day, 4)}</div>
          <div>窗口起点：{formatText(current?.window_start)}</div>
          <div>窗口终点：{formatText(current?.window_end)}</div>
          <div>特征类型：{formatText(current?.feature_type)}</div>
          <div>更新时间：{formatText(current?.updated_at)}</div>
        </div>

        <div>
          <div style={{ marginBottom: 6, color: "#8fe7ff", fontSize: 12 }}>
            最近 {history.length} 条窗口特征
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {history.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                暂无历史窗口数据
              </div>
            ) : (
              history.map((item, index) => (
                <div
                  key={`${item.window_end || item.updated_at || index}-${index}`}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 11,
                  }}
                >
                  <div style={{ color: "#cde8fa", marginBottom: 4 }}>
                    {formatText(item.window_start)} → {formatText(item.window_end)}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 4,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <div>speed: {formatNumber(item.speed)}</div>
                    <div>flow: {formatNumber(item.flow)}</div>
                    <div>occupancy: {formatNumber(item.occupancy, 3)}</div>
                    <div>samples: {formatText(item.sample_count)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}