import { useState, useCallback } from "react";
import MapView from "./MapView.jsx";
import LeftPanel from "./LeftPanel.jsx";
import RightPanel from "./RightPanel.jsx";
import BottomTimeline from "./BottomTimeline.jsx";

export default function Dashboard() {
  const [timeOffset, setTimeOffset] = useState(0);
  const [showPrediction, setShowPrediction] = useState(false);
  const [predWindow, setPredWindow] = useState(0); // 0/15/30/60
  const [sampleIdx, setSampleIdx] = useState(47); // 0-47

  const handleTimeChange = useCallback((timeIdx) => {
    setTimeOffset(timeIdx * 30);
    setSampleIdx(timeIdx % 48);
  }, []);

  const handlePredictionMode = useCallback((windowMinutes) => {
    setShowPrediction(windowMinutes > 0);
    setTimeOffset(windowMinutes);
    setPredWindow(windowMinutes);
  }, []);

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
    </div>
  );
}