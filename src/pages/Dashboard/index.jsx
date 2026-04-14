import { useState, useCallback, useEffect } from "react";
import MapView from "./MapView.jsx";
import LeftPanel from "./LeftPanel.jsx";
import RightPanel from "./RightPanel.jsx";
import BottomTimeline from "./BottomTimeline.jsx";
import FeatureStoreDebugPanel from "../../components/FeatureStoreDebugPanel";
import {
  getPredictionPointsFromCache,
  runPredictFromFeatureStore,
} from "../../api/datastore";

// predWindow → DCRNN horizon
const PRED_TO_HORIZON = { 15: 3, 30: 6, 60: 12 };

export default function Dashboard() {
  const [timeOffset, setTimeOffset] = useState(0);
  const [showPrediction, setShowPrediction] = useState(false);
  const [predWindow, setPredWindow] = useState(0); // 0/15/30/60
  const [sampleIdx, setSampleIdx] = useState(47); // 0-47
  const [cachePoints, setCachePoints] = useState([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheMode, setCacheMode] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(true);

  const currentHorizon = PRED_TO_HORIZON[predWindow] ?? 1;

  const handleTimeChange = useCallback((timeIdx) => {
    setTimeOffset(timeIdx * 30);
    setSampleIdx(timeIdx % 48);

    // 一旦播放/拖动时间轴，就退出 Redis 缓存模式，恢复 sample 播放
    if (cacheMode) {
      setCacheMode(false);
      setCachePoints([]);
    }
  }, [cacheMode]);

const handlePredictionMode = useCallback((windowMinutes) => {
  setShowPrediction(windowMinutes > 0);
  setTimeOffset(windowMinutes);
  setPredWindow(windowMinutes);

  // 点击“实时”时，主动退出 Redis 缓存模式
  if (windowMinutes === 0) {
    setCacheMode(false);
    setCachePoints([]);
  }
}, []);

  const handleLoadCacheHeatmap = useCallback(async () => {
    try {
      setCacheLoading(true);
      const points = await getPredictionPointsFromCache(["1001"], currentHorizon);
      setCachePoints(points || []);
      setCacheMode(true);
      console.log("缓存热力图 points:", points);
    } catch (error) {
      console.error("读取缓存热力图失败:", error);
      setCachePoints([]);
      setCacheMode(false);
    } finally {
      setCacheLoading(false);
    }
  }, [currentHorizon]);

  const handleRunPredictAndLoad = useCallback(async () => {
    try {
      setCacheLoading(true);
      await runPredictFromFeatureStore(["1001"], 12);
      const points = await getPredictionPointsFromCache(["1001"], currentHorizon);
      setCachePoints(points || []);
      setCacheMode(true);
      console.log("预测后缓存热力图 points:", points);
    } catch (error) {
      console.error("从 feature store 触发预测失败:", error);
      setCachePoints([]);
      setCacheMode(false);
    } finally {
      setCacheLoading(false);
    }
  }, [currentHorizon]);

  useEffect(() => {
    let cancelled = false;

    if (!cacheMode) return;

    (async () => {
      try {
        setCacheLoading(true);
        const points = await getPredictionPointsFromCache(["1001"], currentHorizon);
        if (!cancelled) {
          setCachePoints(points || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("切换 horizon 后读取缓存失败:", error);
          setCachePoints([]);
        }
      } finally {
        if (!cancelled) {
          setCacheLoading(false);
        }
      }
    })();

  return () => {
    cancelled = true;
  };
}, [cacheMode, currentHorizon]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-primary)",
      }}
    >
      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
          gap: 0,
        }}
      >
        {/* Left panel */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: "1px solid rgba(0,195,255,0.12)",
            overflow: "hidden",
            background: "rgba(10, 22, 40, 0.6)",
            backdropFilter: "blur(8px)",
          }}
        >
          <LeftPanel timeOffset={timeOffset} />
        </div>

        {/* Center map */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <MapView
            timeOffset={timeOffset}
            showPrediction={showPrediction}
            predWindow={predWindow}
            sampleIdx={sampleIdx}
            horizon={currentHorizon}
            cachePoints={cachePoints}
          />
        </div>

        {/* Right panel */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            borderLeft: "1px solid rgba(0,195,255,0.12)",
            overflow: "hidden",
            background: "rgba(10, 22, 40, 0.6)",
            backdropFilter: "blur(8px)",
          }}
        >
          <RightPanel />
        </div>
      </div>

      {/* Bottom timeline */}
      <div
        style={{
          height: 96,
          flexShrink: 0,
          borderTop: "1px solid rgba(0,195,255,0.15)",
        }}
      >
        <BottomTimeline
          onTimeChange={handleTimeChange}
          onPredictionModeChange={handlePredictionMode}
        />
      </div>

      {/* Feature Store + Cache Debug Area */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid rgba(0,195,255,0.15)",
          background: "rgba(3, 12, 28, 0.95)",
        }}
      >
        <div
  style={{
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
  }}
>
  <button
    onClick={handleLoadCacheHeatmap}
    disabled={cacheLoading}
    style={{
      height: 32,
      padding: "0 14px",
      borderRadius: 6,
      border: "1px solid rgba(0,195,255,0.35)",
      background: "rgba(6,16,36,0.92)",
      color: "#8fe7ff",
      cursor: "pointer",
    }}
  >
    {cacheLoading ? "加载中..." : "加载缓存热力图"}
  </button>

  <button
    onClick={handleRunPredictAndLoad}
    disabled={cacheLoading}
    style={{
      height: 32,
      padding: "0 14px",
      borderRadius: 6,
      border: "1px solid rgba(0,255,200,0.35)",
      background: "rgba(6,16,36,0.92)",
      color: "#00ffc8",
      cursor: "pointer",
    }}
  >
    {cacheLoading ? "预测中..." : "执行预测并加载缓存"}
  </button>

  <button
    onClick={() => setShowDebugPanel((v) => !v)}
    style={{
      height: 32,
      padding: "0 14px",
      borderRadius: 6,
      border: "1px solid rgba(255,149,0,0.35)",
      background: "rgba(6,16,36,0.92)",
      color: "#ffb347",
      cursor: "pointer",
    }}
  >
    {showDebugPanel ? "隐藏调试面板" : "显示调试面板"}
  </button>

  <span style={{ color: "#7fdfff", fontSize: 12 }}>
    当前 horizon: {currentHorizon}，缓存点数: {cachePoints.length}
  </span>
</div>

        {showDebugPanel && <FeatureStoreDebugPanel />}
      </div>
    </div>
  );
}