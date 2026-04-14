import { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================
// BOTTOM TIMELINE - Time control & prediction mode
// ============================================================

const PREDICTION_WINDOWS = [
  { value: 0, label: '实时', color: '#00c3ff' },
  { value: 15, label: '+15min', color: '#39ff6a' },
  { value: 30, label: '+30min', color: '#ff9500' },
  { value: 60, label: '+60min', color: '#ff3b3b' },
];

function generateTimeLabels() {
  const labels = [];
  for (let h = 0; h < 24; h++) {
    labels.push(`${String(h).padStart(2, '0')}:00`);
    labels.push(`${String(h).padStart(2, '0')}:30`);
  }
  return labels;
}
const TIME_LABELS = generateTimeLabels();

function MiniFlowBar({ value, max, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
      <div style={{
        width: '60%',
        height: `${Math.round((value / max) * 28)}px`,
        background: color,
        borderRadius: '2px 2px 0 0',
        opacity: 0.7,
        minHeight: 2,
        transition: 'height 0.3s ease',
      }} />
    </div>
  );
}

export default function BottomTimeline({ onTimeChange, onPredictionModeChange }) {
  const [currentTime, setCurrentTime] = useState(32); // 16:00 (index in 30-min slots)
  const [predictionWindow, setPredictionWindow] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const playRef = useRef(null);
  const sliderRef = useRef(null);

  // Simulated flow data for mini chart (48 half-hour slots)
  const flowData = Array.from({ length: 48 }, (_, i) => {
    let v = 0.3;
    if (i >= 12 && i <= 19) v = 0.6 + 0.4 * Math.sin(((i - 12) / 7) * Math.PI);
    else if (i >= 30 && i <= 39) v = 0.5 + 0.5 * Math.sin(((i - 30) / 9) * Math.PI);
    else if (i >= 6 && i < 12) v = 0.3 + (i - 6) * 0.05;
    return Math.max(0.1, v + (Math.random() - 0.5) * 0.08);
  });
  const maxFlow = Math.max(...flowData);

  const flowColors = flowData.map(v => {
    if (v / maxFlow > 0.85) return '#ff1e1e';
    if (v / maxFlow > 0.70) return '#ff5a00';
    if (v / maxFlow > 0.50) return '#ffc800';
    return '#00c3ff';
  });

  // Auto play
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = (prev + 1) % 48;
          onTimeChange?.(next);
          return next;
        });
      }, 800 / playSpeed);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [isPlaying, playSpeed, onTimeChange]);

  const handleSliderClick = useCallback((e) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * 47);
    setCurrentTime(idx);
    onTimeChange?.(idx);
  }, [onTimeChange]);

  const handlePredictionChange = (val) => {
    setPredictionWindow(val);
    onPredictionModeChange?.(val);
  };

  const currentLabel = TIME_LABELS[currentTime] || '00:00';

  return (
    <div style={{
      height: '100%',
      background: 'rgba(10, 22, 40, 0.96)',
      borderTop: '1px solid rgba(0,195,255,0.2)',
      padding: '8px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      position: 'relative',
    }}>
      {/* Top glow line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,195,255,0.5), transparent)',
      }} />

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {/* Rewind */}
          <button
            onClick={() =>
       		setCurrentTime((prev) => {
  		const next = Math.max(0, prev - 1);
  		onTimeChange?.(next);
    		return next;
  		})
		}

            style={{
              width: 26, height: 26,
              background: 'rgba(0,195,255,0.08)',
              border: '1px solid rgba(0,195,255,0.25)',
              borderRadius: 4,
              color: '#00c3ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              transition: 'all 0.2s',
            }}
          >
            ◀
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: 32, height: 32,
              background: isPlaying ? 'rgba(57,255,106,0.15)' : 'rgba(0,195,255,0.12)',
              border: `1px solid ${isPlaying ? 'rgba(57,255,106,0.5)' : 'rgba(0,195,255,0.4)'}`,
              borderRadius: 4,
              color: isPlaying ? '#39ff6a' : '#00c3ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              transition: 'all 0.2s',
              boxShadow: isPlaying ? '0 0 10px rgba(57,255,106,0.3)' : 'none',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Forward */}
          <button
            onClick={() =>
  setCurrentTime((prev) => {
    const next = Math.min(47, prev + 1);
    onTimeChange?.(next);
    return next;
  })
}
            style={{
              width: 26, height: 26,
              background: 'rgba(0,195,255,0.08)',
              border: '1px solid rgba(0,195,255,0.25)',
              borderRadius: 4,
              color: '#00c3ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              transition: 'all 0.2s',
            }}
          >
            ▶
          </button>

          {/* Speed */}
          <select
            value={playSpeed}
            onChange={(e) => setPlaySpeed(Number(e.target.value))}
            style={{
              background: 'rgba(0,195,255,0.08)',
              border: '1px solid rgba(0,195,255,0.25)',
              borderRadius: 4,
              color: '#00c3ff',
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        {/* Current time display */}
        <div style={{
          background: 'rgba(0,195,255,0.08)',
          border: '1px solid rgba(0,195,255,0.3)',
          borderRadius: 4,
          padding: '4px 12px',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 16, fontFamily: 'var(--font-num)', fontWeight: 700,
            color: '#00c3ff', textShadow: '0 0 8px rgba(0,195,255,0.5)',
          }}>
            {currentLabel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
            2018-09-15
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Prediction window selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>预测时域:</span>
          {PREDICTION_WINDOWS.map(pw => (
            <button
              key={pw.value}
              onClick={() => handlePredictionChange(pw.value)}
              style={{
                padding: '4px 10px',
                background: predictionWindow === pw.value
                  ? `rgba(${pw.value === 0 ? '0,195,255' : pw.value === 15 ? '57,255,106' : pw.value === 30 ? '255,149,0' : '255,59,59'},0.15)`
                  : 'transparent',
                border: `1px solid ${predictionWindow === pw.value
                  ? pw.color + '80'
                  : 'rgba(0,195,255,0.12)'}`,
                borderRadius: 3,
                color: predictionWindow === pw.value ? pw.color : 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: predictionWindow === pw.value ? 600 : 400,
                transition: 'all 0.2s',
                boxShadow: predictionWindow === pw.value ? `0 0 8px ${pw.color}33` : 'none',
              }}
            >
              {pw.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Mode indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: predictionWindow > 0 ? 'rgba(255,149,0,0.08)' : 'rgba(57,255,106,0.06)',
          border: `1px solid ${predictionWindow > 0 ? 'rgba(255,149,0,0.3)' : 'rgba(57,255,106,0.25)'}`,
          borderRadius: 4,
          flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: predictionWindow > 0 ? '#ff9500' : '#39ff6a',
            boxShadow: `0 0 6px ${predictionWindow > 0 ? '#ff9500' : '#39ff6a'}`,
            animation: 'breathe 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 11,
            color: predictionWindow > 0 ? '#ff9500' : '#39ff6a',
            fontWeight: 500,
          }}>
            {predictionWindow > 0 ? `预测模式 +${predictionWindow}min` : '实时监测模式'}
          </span>
        </div>
      </div>

      {/* Timeline slider with mini flow chart */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Mini flow bars */}
        <div
          ref={sliderRef}
          onClick={handleSliderClick}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 1,
            cursor: 'crosshair',
            position: 'relative',
            paddingBottom: 4,
            userSelect: 'none',
          }}
        >
          {flowData.map((v, i) => (
            <MiniFlowBar
              key={i}
              value={v}
              max={maxFlow}
              color={i === currentTime ? '#fff' : flowColors[i]}
            />
          ))}
          {/* Playhead */}
          <div style={{
            position: 'absolute',
            left: `${(currentTime / 47) * 100}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: '#fff',
            boxShadow: '0 0 8px rgba(255,255,255,0.8)',
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 5,
          }} />
          {/* Playhead label */}
          <div style={{
            position: 'absolute',
            left: `${(currentTime / 47) * 100}%`,
            top: -18,
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.9)',
            color: '#0a1628',
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 6,
          }}>
            {currentLabel}
          </div>
        </div>

        {/* Time labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.02em',
        }}>
          {['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
