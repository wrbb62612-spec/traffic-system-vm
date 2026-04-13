/**
 * MapView — ECharts + 高德地图 + DCRNN 热力图
 *
 * 优先使用 Dashboard 传入的 cachePoints 渲染热力图；
 * 若 cachePoints 为空，则回退到 /predict/heatmap?horizon=H&sample=S
 */
import { useRef, useState, useCallback, useEffect } from "react";
import * as echarts from "echarts";
import "echarts-extension-amap";
import { SENSORS, EDGES, SENSOR_MAP, MAP_CENTER } from "../../data/sensorData";

const GAODE_API_KEY = "e27e8a687b0fca316a074c6518ab4aa6";
const GAODE_SECURITY_CODE = "3c5dd518bfbbbfbdd04b1aef35b32d26";
const API_BASE = "http://localhost:8000";

// 热力图渐变色（畅通→拥堵）
const HEAT_GRADIENT = {
  0.0: "#00e5ff",
  0.35: "#00ff88",
  0.6: "#ffe600",
  0.8: "#ff6a00",
  1.0: "#ff0040",
};

// 预测时域映射（horizon → 中文说明）
const HORIZON_LABELS = {
  1: "+5min",
  3: "+15min",
  6: "+30min",
  12: "+60min",
};

let _amapPromise = null;
function ensureAMap() {
  if (_amapPromise) return _amapPromise;
  _amapPromise = new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve();
      return;
    }
    window._AMapSecurityConfig = { securityJsCode: GAODE_SECURITY_CODE };
    const s = document.createElement("script");
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${GAODE_API_KEY}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("AMap 加载失败"));
    document.head.appendChild(s);
  });
  return _amapPromise;
}

const BBOX = SENSORS.reduce(
  (b, s) => ({
    minLng: Math.min(b.minLng, s.lng),
    maxLng: Math.max(b.maxLng, s.lng),
    minLat: Math.min(b.minLat, s.lat),
    maxLat: Math.max(b.maxLat, s.lat),
  }),
  { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
);

const SENSOR_EDATA = SENSORS.map((s) => ({ value: [s.lng, s.lat], sensor: s }));
const EDGE_EDATA = EDGES.map((e) => {
  const src = SENSOR_MAP[e.from];
  const tgt = SENSOR_MAP[e.to];
  return src && tgt ? { coords: [[src.lng, src.lat], [tgt.lng, tgt.lat]] } : null;
}).filter(Boolean);

const DEFAULT_LAYERS = { sensors: true, edges: true, heatmap: true };

function buildHeatDataset(points) {
  return {
    data: points.map((p) => ({ lng: p[0], lat: p[1], count: p[2] })),
    max: 1,
  };
}

// ── Tooltip ──────────────────────────────────────────────────
function SensorTooltip({ sensor, heatInfo, x, y }) {
  if (!sensor) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x + 14,
        top: y - 14,
        background: "rgba(6,14,30,0.97)",
        border: "1px solid rgba(0,195,255,0.45)",
        borderRadius: 8,
        padding: "10px 14px",
        pointerEvents: "none",
        zIndex: 1000,
        minWidth: 210,
        backdropFilter: "blur(12px)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 14,
          right: 14,
          height: 1.5,
          background:
            "linear-gradient(90deg,transparent,#00c3ff 40%,#00ffc8 60%,transparent)",
        }}
      />
      <div
        style={{
          fontSize: 9,
          color: "rgba(0,195,255,0.5)",
          marginBottom: 3,
        }}
      >
        METR-LA · 点击定位
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#e0f0ff",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        传感器 #{sensor.index}
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            fontWeight: 400,
            marginLeft: 8,
          }}
        >
          ID {sensor.id}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 14px" }}>
        {[
          { k: "Latitude", v: sensor.lat.toFixed(6) },
          { k: "Longitude", v: sensor.lng.toFixed(6) },
          ...(heatInfo
            ? [
                { k: "预测速度", v: `${heatInfo.pred_speed} mph` },
                { k: "拥堵热力", v: heatInfo.heat_value.toFixed(3) },
              ]
            : []),
        ].map((it) => (
          <div key={it.k}>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 1,
              }}
            >
              {it.k}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#00ffc8",
                fontFamily: "monospace",
              }}
            >
              {it.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 导航控件 ─────────────────────────────────────────────────
function NavControls({ zoom, onZoom, onFitAll, onNorth }) {
  const btn = (accent = false) => ({
    width: 34,
    height: 34,
    borderRadius: 6,
    cursor: "pointer",
    background: "rgba(6,16,36,0.92)",
    border: `1px solid ${accent ? "rgba(0,195,255,0.5)" : "rgba(0,195,255,0.28)"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: accent ? "#00c3ff" : "rgba(255,255,255,0.75)",
    backdropFilter: "blur(8px)",
    flexShrink: 0,
  });

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <button onClick={onNorth} title="正北" style={btn(true)}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2.5L10.5 8H7.5L9 2.5Z" fill="#ff4040" />
          <path d="M9 15.5L7.5 10H10.5L9 15.5Z" fill="rgba(255,255,255,0.4)" />
          <circle cx="9" cy="9" r="1.5" fill="#00c3ff" />
        </svg>
      </button>
      <button onClick={() => onZoom(1)} title="放大" style={{ ...btn(), fontSize: 20, fontWeight: 300 }}>
        +
      </button>
      <div
        style={{
          ...btn(),
          cursor: "default",
          fontSize: 9,
          color: "rgba(0,195,255,0.8)",
          fontFamily: "monospace",
          height: 26,
        }}
      >
        z{zoom?.toFixed(1)}
      </div>
      <button onClick={() => onZoom(-1)} title="缩小" style={{ ...btn(), fontSize: 22, fontWeight: 200 }}>
        −
      </button>
      <button onClick={onFitAll} title="全览所有传感器" style={btn()}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1" y="9" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="9" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  );
}

// ── 图层控制 ──────────────────────────────────────────────────
function LayerControls({ layers, onToggle, heatmapStatus, heatSourceLabel, isLiveModel }) {
  const defs = [
    { id: "heatmap", label: "拥堵热力图 (DCRNN)", color: "#ff6030" },
    { id: "sensors", label: `传感器节点 (${SENSORS.length})`, color: "#00c3ff" },
    { id: "edges", label: `路网连接 (${EDGES.length})`, color: "#3399dd" },
  ];

  return (
    <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
      <div
        style={{
          background: "rgba(6,14,30,0.92)",
          border: "1px solid rgba(0,195,255,0.25)",
          borderRadius: 6,
          padding: 10,
          backdropFilter: "blur(10px)",
          minWidth: 180,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "rgba(0,195,255,0.6)",
            marginBottom: 8,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          METR-LA 图层
        </div>
        {defs.map((l) => (
          <div
            key={l.id}
            onClick={() => onToggle(l.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 0",
              cursor: "pointer",
              opacity: layers[l.id] ? 1 : 0.35,
            }}
          >
            <div
              style={{
                width: 22,
                height: 10,
                borderRadius: 2,
                background: layers[l.id] ? l.color : "rgba(255,255,255,0.15)",
                boxShadow: layers[l.id] ? `0 0 5px ${l.color}60` : "none",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: layers[l.id] ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
              }}
            >
              {l.label}
            </span>
          </div>
        ))}

        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.07)",
            fontSize: 9,
            color: "rgba(255,255,255,0.28)",
            lineHeight: 1.8,
          }}
        >
          源: {heatSourceLabel || "未知数据源"}
          <br />
          <span
            style={{
              color:
                heatmapStatus === "ok"
                  ? "#39ff6a"
                  : heatmapStatus === "loading"
                    ? "#ffc800"
                    : "#ff4040",
            }}
          >
            {heatmapStatus === "ok"
              ? "● 热力图已加载"
              : heatmapStatus === "loading"
                ? "◌ 加载中..."
                : "✕ 数据加载失败"}
          </span>
          <br />
          <span style={{ color: isLiveModel ? "#00ffc8" : "#ff9500" }}>
            {isLiveModel ? "模型链路: 在线推理缓存" : "模型链路: 离线回放"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 热力图图例 ─────────────────────────────────────────────────
function HeatmapLegend({ show }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 46,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(6,14,30,0.9)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 5,
        padding: "5px 12px",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>畅通</span>
      <div
        style={{
          width: 100,
          height: 8,
          borderRadius: 4,
          background: "linear-gradient(90deg,#00e5ff,#00ff88,#ffe600,#ff6a00,#ff0040)",
        }}
      />
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>拥堵</span>
      <div
        style={{
          width: 1,
          height: 14,
          background: "rgba(255,255,255,0.1)",
          margin: "0 4px",
        }}
      />
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>DCRNN 预测</span>
    </div>
  );
}

// ── 统计浮层 ──────────────────────────────────────────────────
function StatsBar({ zoom, selectedId, heatPoints }) {
  const avgSpeed = heatPoints.length
    ? (heatPoints.reduce((s, p) => s + p[2], 0) / heatPoints.length * 70).toFixed(1)
    : null;

  const items = [
    { k: "传感器", v: SENSORS.length, u: "个", c: "#00c3ff" },
    { k: "路网边", v: EDGES.length, u: "条", c: "#3399dd" },
    { k: "缩放", v: zoom?.toFixed(1), u: "", c: "#00ffc8" },
    ...(avgSpeed !== null ? [{ k: "均速预测", v: `${avgSpeed}`, u: "mph", c: "#ff9500" }] : []),
  ];
  if (selectedId !== null) items.push({ k: "已选中", v: `#${selectedId}`, u: "", c: "#ffd060" });

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        gap: 6,
      }}
    >
      {items.map((it) => (
        <div
          key={it.k}
          style={{
            background: "rgba(6,14,30,0.88)",
            border: `1px solid ${it.c}28`,
            borderRadius: 5,
            padding: "5px 11px",
            backdropFilter: "blur(10px)",
            textAlign: "center",
            minWidth: 62,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontFamily: "monospace",
              fontWeight: 700,
              color: it.c,
              lineHeight: 1.2,
            }}
          >
            {it.v}
            <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{it.u}</span>
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.36)", marginTop: 2 }}>{it.k}</div>
        </div>
      ))}
    </div>
  );
}

// ── 预测时域选择器 ─────────────────────────────────────────────
function HorizonSelector({ horizon, onChange, loading }) {
  const opts = [
    { h: 1, label: "+5min", color: "#00c3ff" },
    { h: 3, label: "+15min", color: "#39ff6a" },
    { h: 6, label: "+30min", color: "#ff9500" },
    { h: 12, label: "+60min", color: "#ff3b3b" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 56,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "rgba(0,195,255,0.5)",
          textAlign: "center",
          marginBottom: 2,
          letterSpacing: "0.08em",
        }}
      >
        预测时域
      </div>
      {opts.map((o) => (
        <button
          key={o.h}
          onClick={() => onChange(o.h)}
          disabled={loading}
          style={{
            width: 52,
            height: 26,
            borderRadius: 4,
            cursor: "pointer",
            background: horizon === o.h ? `${o.color}22` : "rgba(6,16,36,0.9)",
            border: `1px solid ${horizon === o.h ? o.color + "88" : "rgba(0,195,255,0.18)"}`,
            color: horizon === o.h ? o.color : "rgba(255,255,255,0.45)",
            fontSize: 10,
            fontWeight: horizon === o.h ? 700 : 400,
            boxShadow: horizon === o.h ? `0 0 8px ${o.color}44` : "none",
            transition: "all 0.2s",
          }}
        >
          {loading && horizon === o.h ? "…" : o.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// MAIN MAP VIEW
// ============================================================
export default function MapView({
  horizon: horizonProp = 1,
  sampleIdx = 47,
  cachePoints = [],
}) {
  const wrapRef = useRef(null);
  const latestHeatRef = useRef({ points: [], visible: true });
  const chartRef = useRef(null);
  const ecRef = useRef(null);
  const amapRef = useRef(null);
  const heatLayerRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(10.5);
  const [, setCenter] = useState({ lng: MAP_CENTER[0], lat: MAP_CENTER[1] });
  const [tooltip, setTooltip] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [layerVis, setLayerVis] = useState(DEFAULT_LAYERS);

  const [horizon, setHorizon] = useState(horizonProp);
  const [heatPoints, setHeatPoints] = useState([]);
  const [heatInfoMap, setHeatInfoMap] = useState({});
  const [heatStatus, setHeatStatus] = useState("idle");
  const [currentSample, setCurrentSample] = useState(sampleIdx);
  const [usingCacheHeatmap, setUsingCacheHeatmap] = useState(false);

  useEffect(() => {
    setHorizon(horizonProp);
  }, [horizonProp]);

  useEffect(() => {
    setCurrentSample(sampleIdx);
  }, [sampleIdx]);

  useEffect(() => {
    latestHeatRef.current = {
      points: heatPoints,
      visible: layerVis.heatmap,
    };
  }, [heatPoints, layerVis.heatmap]);

  // ── 热力图数据来源：优先 cachePoints，回退 predict/heatmap ─────────────────
  useEffect(() => {
    let cancelled = false;

    if (Array.isArray(cachePoints) && cachePoints.length > 0) {
      const points = cachePoints.map((p) => [p.lon, p.lat, p.heat_value]);
      const infoMap = {};
      cachePoints.forEach((p) => {
        infoMap[String(p.sensor_id)] = p;
      });

      setHeatPoints(points);
      setHeatInfoMap(infoMap);
      setHeatStatus("ok");
      setUsingCacheHeatmap(true);

      return () => {
        cancelled = true;
      };
    }

    setHeatStatus("loading");
    setUsingCacheHeatmap(false);

    fetch(`${API_BASE}/predict/heatmap?horizon=${horizon}&sample=${currentSample}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const points = data.points.map((p) => [p.lon, p.lat, p.heat_value]);
        const infoMap = {};
        data.points.forEach((p) => {
          infoMap[String(p.sensor_id)] = p;
        });
        setHeatPoints(points);
        setHeatInfoMap(infoMap);
        setHeatStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setHeatStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [horizon, currentSample, cachePoints]);

  // ── 初始化 ECharts + AMap ─────────────────────────────────
  useEffect(() => {
    let alive = true;
    let roInstance = null;

    ensureAMap()
      .then(() => {
        if (!alive || !chartRef.current) return;

        const chart =
          echarts.getInstanceByDom(chartRef.current) ??
          echarts.init(chartRef.current, null, { renderer: "canvas" });
        ecRef.current = chart;

        chart.setOption({
          amap: {
            center: [MAP_CENTER[0], MAP_CENTER[1]],
            zoom: 10.5,
            mapStyle: "amap://styles/dark",
            resizeEnable: true,
            renderOnMoving: true,
            echartsLayerInteractive: true,
          },
          legend: { show: false, data: ["edges", "sensors"] },
          series: [
            {
              name: "edges",
              type: "lines",
              coordinateSystem: "amap",
              data: EDGE_EDATA,
              lineStyle: { color: "#1a6fa0", opacity: 0.55, width: 1 },
              silent: true,
              zlevel: 10,
            },
            {
              name: "sensors",
              type: "effectScatter",
              coordinateSystem: "amap",
              data: SENSOR_EDATA,
              symbolSize: 7,
              showEffectOn: "render",
              rippleEffect: { brushType: "stroke", period: 3, scale: 2.8 },
              itemStyle: {
                color: "#00c3ff",
                shadowBlur: 6,
                shadowColor: "#00c3ff88",
              },
              emphasis: {
                itemStyle: { color: "#ffd060", shadowColor: "#ffd06088" },
              },
              zlevel: 20,
            },
          ],
        });

        function tryBindAMap() {
          try {
            const amapComp = chart.getModel().getComponent("amap");
            if (!amapComp) return false;
            const amap = amapComp.getAMap();
            if (!amap) return false;
            amapRef.current = amap;

            function syncView() {
              const c = amap.getCenter();
              setZoom(amap.getZoom());
              setCenter({ lng: c.lng, lat: c.lat });
            }
            amap.on("mapmove", syncView);
            amap.on("zoomchange", syncView);

            let revealed = false;
            const reveal = () => {
              if (!alive || revealed) return;
              revealed = true;
              chart.resize();
              setMapReady(true);
            };

            amap.on("tilesloaded", reveal);

            setTimeout(() => {
              if (!alive || revealed) return;
              amap.panBy(1, 0);
              setTimeout(() => {
                if (!alive) return;
                amap.panBy(-1, 0);
              }, 120);
            }, 300);

            setTimeout(reveal, 4000);

            window.AMap.plugin("AMap.HeatMap", () => {
              if (!alive) return;
              const heatLayer = new window.AMap.HeatMap(amap, {
                radius: 70,
                opacity: [0, 0.88],
                gradient: HEAT_GRADIENT,
                zooms: [3, 22],
              });
              heatLayerRef.current = heatLayer;
              if (heatLayerRef._pendingData) {
                heatLayer.setDataSet(heatLayerRef._pendingData);
                heatLayerRef._pendingData = null;
              }
            });

            return true;
          } catch {
            return false;
          }
        }

        let bound = false;
        chart.on("rendered", () => {
          if (!bound) bound = tryBindAMap();
        });

        chart.on("mouseover", (params) => {
          if (params.data?.sensor) {
            setTooltip({
              sensor: params.data.sensor,
              x: params.event.offsetX,
              y: params.event.offsetY,
            });
            chartRef.current.style.cursor = "pointer";
          }
        });

        chart.on("mouseout", () => {
          setTooltip(null);
          if (chartRef.current) chartRef.current.style.cursor = "grab";
        });

        chart.on("click", (params) => {
          if (!params.data?.sensor) return;
          const s = params.data.sensor;
          setSelectedId(s.index);
          const amap = amapRef.current;
          if (amap) amap.setZoomAndCenter(Math.max(amap.getZoom(), 14), [s.lng, s.lat]);
        });

        roInstance = new ResizeObserver(() => {
          chart.resize();
          const amap = amapRef.current;
          if (amap) {
            try {
              amap.resize();
            } catch {}
          }

          const layer = heatLayerRef.current;
          const { points, visible } = latestHeatRef.current;
          if (layer && visible && points.length > 0) {
            requestAnimationFrame(() => {
              try {
                layer.setDataSet(buildHeatDataset(points));
                layer.show();
              } catch {}
            });
          }
        });
        roInstance.observe(chartRef.current);
      })
      .catch((err) => console.error("[MapView]", err));

    return () => {
      alive = false;
      roInstance?.disconnect();
      ecRef.current?.dispose();
      ecRef.current = null;
      amapRef.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  // ── 热力图数据更新（AMap 原生 HeatMap 层）────────────────────
  useEffect(() => {
    const layer = heatLayerRef.current;
    const show = layerVis.heatmap && heatPoints.length > 0;

    if (!layer) {
      if (show) {
        heatLayerRef._pendingData = buildHeatDataset(heatPoints);
      } else {
        heatLayerRef._pendingData = null;
      }
      return;
    }

    if (!show) {
      layer.hide();
      return;
    }

    layer.setDataSet(buildHeatDataset(heatPoints));
    layer.show();
  }, [heatPoints, layerVis.heatmap]);

  // ── ECharts 图层显隐（edges / sensors）────────────────────
  useEffect(() => {
    const chart = ecRef.current;
    if (!chart) return;

    ["edges", "sensors"].forEach((name) => {
      chart.dispatchAction({
        type: layerVis[name] ? "legendSelect" : "legendUnSelect",
        name,
      });
    });
  }, [layerVis]);

  const handleZoom = useCallback((dz) => {
    const amap = amapRef.current;
    if (!amap) return;
    amap.setZoom(Math.min(Math.max(amap.getZoom() + dz, 3), 20));
  }, []);

  const handleFitAll = useCallback(() => {
    const amap = amapRef.current;
    if (!amap) return;
    const cx = (BBOX.minLng + BBOX.maxLng) / 2;
    const cy = (BBOX.minLat + BBOX.maxLat) / 2;
    amap.setZoomAndCenter(10.2, [cx, cy]);
  }, []);

  const handleNorth = useCallback(() => {
    const amap = amapRef.current;
    if (amap) amap.setRotation(0);
  }, []);

  const handleLayerToggle = useCallback((id) => {
    setLayerVis((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const tooltipHeatInfo = tooltip?.sensor ? heatInfoMap[String(tooltip.sensor.id)] ?? null : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#020813",
      }}
    >
      <div ref={chartRef} style={{ position: "absolute", inset: 0 }} />

      {!mapReady && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 200,
            background: "#020813",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <style>{`
            @keyframes mv-spin { to { transform: rotate(360deg); } }
            @keyframes mv-pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
          `}</style>

          <div style={{ position: "relative", width: 90, height: 90 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "1px solid rgba(0,195,255,0.12)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "#00c3ff",
                borderRightColor: "rgba(0,195,255,0.3)",
                animation: "mv-spin 1.1s linear infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 10,
                borderRadius: "50%",
                border: "1px solid transparent",
                borderTopColor: "rgba(0,255,200,0.6)",
                animation: "mv-spin 0.75s linear infinite reverse",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: "50%",
                width: 6,
                height: 6,
                marginLeft: -3,
                marginTop: -3,
                borderRadius: "50%",
                background: "#00c3ff",
                boxShadow: "0 0 8px 2px #00c3ff",
                animation: "mv-pulse 1.4s ease-in-out infinite",
              }}
            />
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 13,
                letterSpacing: 3,
                color: "rgba(0,195,255,0.85)",
                fontFamily: "monospace",
                animation: "mv-pulse 1.4s ease-in-out infinite",
              }}
            >
              正在加载地图
            </div>
            <div
              style={{
                fontSize: 10,
                marginTop: 6,
                color: "rgba(0,195,255,0.35)",
                letterSpacing: 1,
              }}
            >
              METR-LA · Los Angeles
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          background:
            "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,195,255,0.012) 3px,rgba(0,195,255,0.012) 4px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          background: "radial-gradient(ellipse at center,transparent 45%,rgba(2,8,20,0.72) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 6,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg,transparent,rgba(0,195,255,0.8) 30%,rgba(0,255,200,0.8) 70%,transparent)",
          boxShadow: "0 0 14px 2px rgba(0,195,255,0.2)",
        }}
      />

      {heatStatus === "ok" && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 116,
            zIndex: 10,
            background: usingCacheHeatmap ? "rgba(0,255,200,0.10)" : "rgba(6,14,30,0.9)",
            border: `1px solid ${usingCacheHeatmap ? "rgba(0,255,200,0.45)" : "rgba(255,149,0,0.4)"}`,
            borderRadius: 4,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: usingCacheHeatmap ? "#00ffc8" : "#ff9500",
            backdropFilter: "blur(8px)",
          }}
        >
          {usingCacheHeatmap ? "Redis 缓存预测" : "DCRNN 预测"}{" "}
          {HORIZON_LABELS[horizon] ?? `+${horizon * 5}min`}
        </div>
      )}

      <StatsBar zoom={zoom} selectedId={selectedId} heatPoints={heatPoints} />

      <LayerControls
        layers={layerVis}
        onToggle={handleLayerToggle}
        heatmapStatus={heatStatus}
        heatSourceLabel={usingCacheHeatmap ? "Redis 预测缓存" : "predict/heatmap 离线回放"}
        isLiveModel={usingCacheHeatmap}
      />

      <HorizonSelector horizon={horizon} onChange={setHorizon} loading={heatStatus === "loading"} />
      <NavControls zoom={zoom} onZoom={handleZoom} onFitAll={handleFitAll} onNorth={handleNorth} />
      <HeatmapLegend show={layerVis.heatmap && heatPoints.length > 0} />

      <SensorTooltip
        sensor={tooltip?.sensor}
        heatInfo={tooltipHeatInfo}
        x={tooltip?.x ?? 0}
        y={tooltip?.y ?? 0}
      />
    </div>
  );
}