/**
 * Traffic Intelligence System - Mock Data Layer
 * Based on PEMS (California Performance Measurement System) datasets
 *
 * PEMS03: Los Angeles area highways, Sep-Nov 2018, 358 sensors, 26208 records
 * PEMS04: San Francisco Bay Area, Jan-Feb 2018, 307 sensors, 16992 records
 * PEMS07: California District 7, May 2017-Aug 2018, 883 sensors, 28224 records
 * PEMS08: San Bernardino, Jul-Aug 2016, 170 sensors, 17856 records
 */

// ============================================================
// PEMS DATASET REGISTRY
// ============================================================

export const PEMS_DATASETS = {
  PEMS03: {
    id: 'PEMS03',
    name: 'PEMS03 - 洛杉矶地区',
    nameEn: 'Los Angeles Area',
    center: [-118.243, 34.052],
    sensors: 358,
    records: 26208,
    period: '2018-09-01 ~ 2018-11-30',
    coverage: '洛杉矶高速公路网络',
    color: [0, 195, 255],
    highways: ['I-5', 'I-10', 'I-405', 'US-101', 'I-110', 'I-210'],
    zoom: 9.5,
  },
  PEMS04: {
    id: 'PEMS04',
    name: 'PEMS04 - 旧金山湾区',
    nameEn: 'San Francisco Bay Area',
    center: [-122.278, 37.771],
    sensors: 307,
    records: 16992,
    period: '2018-01-01 ~ 2018-02-28',
    coverage: '旧金山湾区高速公路网络',
    color: [57, 255, 106],
    highways: ['I-80', 'US-101', 'I-880', 'I-580', 'I-280', 'I-680'],
    zoom: 10,
  },
  PEMS07: {
    id: 'PEMS07',
    name: 'PEMS07 - 加州第七区',
    nameEn: 'California District 7',
    center: [-118.412, 34.198],
    sensors: 883,
    records: 28224,
    period: '2017-05-01 ~ 2018-08-31',
    coverage: '洛杉矶及文图拉县高速公路',
    color: [255, 149, 0],
    highways: ['I-5', 'I-405', 'US-101', 'SR-118', 'SR-126', 'SR-23'],
    zoom: 9,
  },
  PEMS08: {
    id: 'PEMS08',
    name: 'PEMS08 - 圣贝纳迪诺',
    nameEn: 'San Bernardino',
    center: [-117.290, 34.106],
    sensors: 170,
    records: 17856,
    period: '2016-07-01 ~ 2016-08-31',
    coverage: '圣贝纳迪诺地区高速公路',
    color: [178, 75, 255],
    highways: ['I-10', 'I-215', 'I-15', 'SR-60', 'SR-210', 'SR-91'],
    zoom: 10.5,
  },
};

// ============================================================
// HIGHWAY PATH DATA (Deck.gl PathLayer)
// ============================================================

// Pseudo-random generator (seeded for consistency)
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateHighwayPaths() {
  return [
    // PEMS03 - Los Angeles
    {
      id: 'I5-LA', name: 'I-5 洛杉矶段', dataset: 'PEMS03',
      speed: 42, flow: 3200, congestion: 'heavy',
      color: [255, 60, 60, 200],
      path: [
        [-118.152, 33.756], [-118.200, 33.800], [-118.220, 33.850],
        [-118.240, 33.900], [-118.245, 33.950], [-118.248, 33.990],
        [-118.243, 34.048], [-118.210, 34.090], [-118.185, 34.140],
        [-118.195, 34.190], [-118.225, 34.240],
      ],
    },
    {
      id: 'I10-LA', name: 'I-10 圣莫尼卡高速', dataset: 'PEMS03',
      speed: 28, flow: 4100, congestion: 'severe',
      color: [255, 30, 30, 220],
      path: [
        [-118.648, 34.020], [-118.600, 34.020], [-118.550, 34.021],
        [-118.500, 34.023], [-118.450, 34.026], [-118.400, 34.030],
        [-118.360, 34.035], [-118.320, 34.040], [-118.280, 34.045],
        [-118.240, 34.050], [-118.200, 34.058], [-118.150, 34.067],
      ],
    },
    {
      id: 'I405-LA', name: 'I-405 圣地亚哥高速', dataset: 'PEMS03',
      speed: 18, flow: 4800, congestion: 'severe',
      color: [255, 10, 10, 230],
      path: [
        [-118.480, 33.748], [-118.474, 33.800], [-118.473, 33.855],
        [-118.468, 33.905], [-118.455, 33.955], [-118.450, 34.005],
        [-118.446, 34.055], [-118.452, 34.105], [-118.462, 34.155],
        [-118.472, 34.205], [-118.490, 34.255],
      ],
    },
    {
      id: 'US101-LA', name: 'US-101 好莱坞高速', dataset: 'PEMS03',
      speed: 35, flow: 3600, congestion: 'moderate',
      color: [255, 149, 0, 190],
      path: [
        [-118.490, 34.008], [-118.458, 34.018], [-118.420, 34.026],
        [-118.390, 34.038], [-118.358, 34.049], [-118.325, 34.062],
        [-118.292, 34.075], [-118.258, 34.090], [-118.235, 34.098],
        [-118.218, 34.082], [-118.202, 34.070],
      ],
    },
    {
      id: 'I110-LA', name: 'I-110 港口高速', dataset: 'PEMS03',
      speed: 55, flow: 2800, congestion: 'light',
      color: [0, 195, 255, 180],
      path: [
        [-118.272, 33.790], [-118.271, 33.840], [-118.270, 33.890],
        [-118.268, 33.940], [-118.262, 33.990], [-118.248, 34.042],
        [-118.235, 34.072], [-118.222, 34.100],
      ],
    },
    {
      id: 'I210-LA', name: 'I-210 山麓高速', dataset: 'PEMS03',
      speed: 62, flow: 2100, congestion: 'free',
      color: [57, 255, 106, 180],
      path: [
        [-118.110, 34.140], [-118.150, 34.148], [-118.190, 34.155],
        [-118.230, 34.160], [-118.270, 34.162], [-118.310, 34.158],
        [-118.350, 34.152], [-118.390, 34.148], [-118.430, 34.145],
      ],
    },
    // PEMS04 - San Francisco Bay Area
    {
      id: 'I80-SF', name: 'I-80 湾区大桥', dataset: 'PEMS04',
      speed: 38, flow: 3900, congestion: 'heavy',
      color: [255, 90, 90, 200],
      path: [
        [-122.517, 37.821], [-122.480, 37.810], [-122.440, 37.798],
        [-122.395, 37.795], [-122.358, 37.803], [-122.320, 37.820],
        [-122.285, 37.845], [-122.248, 37.862],
      ],
    },
    {
      id: 'US101-SF', name: 'US-101 半岛高速', dataset: 'PEMS04',
      speed: 48, flow: 3200, congestion: 'moderate',
      color: [255, 149, 0, 190],
      path: [
        [-122.420, 37.700], [-122.418, 37.735], [-122.410, 37.768],
        [-122.405, 37.800], [-122.410, 37.835], [-122.420, 37.870],
        [-122.435, 37.905], [-122.452, 37.938], [-122.465, 37.970],
      ],
    },
    {
      id: 'I880-SF', name: 'I-880 东湾高速', dataset: 'PEMS04',
      speed: 55, flow: 2600, congestion: 'light',
      color: [0, 195, 255, 175],
      path: [
        [-122.260, 37.620], [-122.268, 37.660], [-122.272, 37.700],
        [-122.270, 37.740], [-122.264, 37.780], [-122.255, 37.820],
        [-122.246, 37.860], [-122.252, 37.900], [-122.262, 37.940],
      ],
    },
    {
      id: 'I580-SF', name: 'I-580 阿拉米达高速', dataset: 'PEMS04',
      speed: 60, flow: 2200, congestion: 'free',
      color: [57, 255, 106, 170],
      path: [
        [-122.000, 37.700], [-122.060, 37.710], [-122.120, 37.720],
        [-122.180, 37.740], [-122.240, 37.768], [-122.285, 37.798],
        [-122.315, 37.845], [-122.360, 37.870],
      ],
    },
    // PEMS07 - California District 7
    {
      id: 'I5-D7', name: 'I-5 加州第七区', dataset: 'PEMS07',
      speed: 45, flow: 3100, congestion: 'moderate',
      color: [255, 149, 0, 185],
      path: [
        [-118.200, 34.200], [-118.220, 34.250], [-118.215, 34.300],
        [-118.225, 34.350], [-118.232, 34.400], [-118.245, 34.450],
        [-118.258, 34.500], [-118.272, 34.550],
      ],
    },
    {
      id: 'I405-D7', name: 'I-405 文图拉段', dataset: 'PEMS07',
      speed: 30, flow: 4200, congestion: 'heavy',
      color: [255, 70, 70, 200],
      path: [
        [-118.490, 34.255], [-118.508, 34.305], [-118.520, 34.355],
        [-118.518, 34.405], [-118.512, 34.455], [-118.505, 34.505],
      ],
    },
    {
      id: 'US101-D7', name: 'US-101 文图拉公路', dataset: 'PEMS07',
      speed: 65, flow: 1900, congestion: 'free',
      color: [57, 255, 106, 165],
      path: [
        [-118.202, 34.070], [-118.262, 34.128], [-118.345, 34.192],
        [-118.432, 34.245], [-118.512, 34.290], [-118.570, 34.335],
        [-118.640, 34.355], [-118.710, 34.378], [-118.785, 34.392],
        [-118.860, 34.398], [-118.930, 34.407],
      ],
    },
    // PEMS08 - San Bernardino
    {
      id: 'I10-SB', name: 'I-10 圣贝纳迪诺段', dataset: 'PEMS08',
      speed: 52, flow: 2800, congestion: 'light',
      color: [0, 195, 255, 175],
      path: [
        [-117.550, 34.086], [-117.480, 34.092], [-117.420, 34.098],
        [-117.360, 34.104], [-117.300, 34.110], [-117.245, 34.105],
        [-117.185, 34.098], [-117.120, 34.088],
      ],
    },
    {
      id: 'I215-SB', name: 'I-215 圣安德烈亚斯高速', dataset: 'PEMS08',
      speed: 35, flow: 3600, congestion: 'heavy',
      color: [255, 70, 70, 200],
      path: [
        [-117.295, 34.050], [-117.294, 34.095], [-117.292, 34.140],
        [-117.288, 34.185], [-117.282, 34.230], [-117.310, 34.275],
      ],
    },
    {
      id: 'I15-SB', name: 'I-15 莫哈韦沙漠高速', dataset: 'PEMS08',
      speed: 70, flow: 1600, congestion: 'free',
      color: [57, 255, 106, 160],
      path: [
        [-117.402, 33.950], [-117.378, 33.990], [-117.360, 34.030],
        [-117.352, 34.070], [-117.348, 34.110], [-117.342, 34.150],
        [-117.340, 34.190], [-117.348, 34.230],
      ],
    },
  ];
}

export const HIGHWAY_PATHS = generateHighwayPaths();

// ============================================================
// SENSOR LOCATION DATA (Deck.gl ScatterplotLayer)
// ============================================================

function generateSensors(dataset, count, centerLng, centerLat, spread) {
  const rng = seededRandom(dataset.charCodeAt(0) * 31 + count);
  const sensors = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * spread;
    const lng = centerLng + r * Math.cos(angle) * 1.2;
    const lat = centerLat + r * Math.sin(angle);
    const flow = Math.floor(rng() * 3500 + 500);
    const speed = Math.floor(rng() * 70 + 15);
    const congestionLevel = speed < 25 ? 'severe' : speed < 40 ? 'heavy' : speed < 55 ? 'moderate' : speed < 65 ? 'light' : 'free';
    const colorMap = {
      severe: [255, 30, 30],
      heavy: [255, 90, 0],
      moderate: [255, 200, 0],
      light: [100, 220, 100],
      free: [0, 195, 255],
    };
    sensors.push({
      id: `${dataset}-sensor-${i}`,
      dataset,
      position: [lng, lat],
      flow,
      speed,
      congestion: congestionLevel,
      color: colorMap[congestionLevel],
      radius: 120 + rng() * 80,
    });
  }
  return sensors;
}

export const ALL_SENSORS = [
  ...generateSensors('PEMS03', 80, -118.243, 34.052, 0.22),
  ...generateSensors('PEMS04', 70, -122.278, 37.771, 0.20),
  ...generateSensors('PEMS07', 100, -118.412, 34.198, 0.28),
  ...generateSensors('PEMS08', 50, -117.290, 34.106, 0.18),
];

// ============================================================
// ARC DATA - Congestion Propagation (Deck.gl ArcLayer)
// ============================================================

export const CONGESTION_ARCS = [
  // LA area propagation
  { source: [-118.405, 34.005], target: [-118.350, 34.030], color: [255, 60, 60, 180], width: 3, dataset: 'PEMS03' },
  { source: [-118.350, 34.030], target: [-118.295, 34.045], color: [255, 100, 0, 160], width: 2.5, dataset: 'PEMS03' },
  { source: [-118.295, 34.045], target: [-118.240, 34.052], color: [255, 149, 0, 140], width: 2, dataset: 'PEMS03' },
  { source: [-118.450, 34.005], target: [-118.480, 33.955], color: [255, 30, 30, 190], width: 3, dataset: 'PEMS03' },
  { source: [-118.480, 33.955], target: [-118.468, 33.905], color: [255, 80, 0, 170], width: 2.5, dataset: 'PEMS03' },
  { source: [-118.243, 34.048], target: [-118.215, 34.025], color: [255, 60, 60, 155], width: 2, dataset: 'PEMS03' },
  // SF Bay Area propagation
  { source: [-122.395, 37.795], target: [-122.350, 37.810], color: [255, 80, 80, 170], width: 2.5, dataset: 'PEMS04' },
  { source: [-122.350, 37.810], target: [-122.310, 37.825], color: [255, 130, 0, 150], width: 2, dataset: 'PEMS04' },
  { source: [-122.410, 37.768], target: [-122.380, 37.790], color: [255, 60, 60, 160], width: 2, dataset: 'PEMS04' },
  // San Bernardino propagation
  { source: [-117.293, 34.095], target: [-117.340, 34.080], color: [178, 75, 255, 170], width: 2.5, dataset: 'PEMS08' },
  { source: [-117.340, 34.080], target: [-117.380, 34.070], color: [200, 100, 255, 140], width: 2, dataset: 'PEMS08' },
];

// ============================================================
// TIME SERIES DATA - 24-Hour Traffic Flow
// ============================================================

function generateHourlyFlow(seed, baseFlow, peakMorning, peakEvening, noise) {
  const rng = seededRandom(seed);
  return Array.from({ length: 24 }, (_, h) => {
    let factor = 0.3;
    if (h >= 6 && h <= 9) factor = 0.6 + (peakMorning - 0.6) * Math.sin(((h - 6) / 3) * Math.PI);
    else if (h >= 10 && h <= 14) factor = 0.65;
    else if (h >= 15 && h <= 19) factor = 0.65 + (peakEvening - 0.65) * Math.sin(((h - 15) / 4) * Math.PI);
    else if (h >= 20 && h <= 23) factor = 0.4 - (h - 20) * 0.05;
    const noiseVal = (rng() - 0.5) * noise;
    return Math.round(baseFlow * (factor + noiseVal));
  });
}

function generateHourlySpeed(seed, freeflowSpeed, peakFactor, noise) {
  const rng = seededRandom(seed);
  return Array.from({ length: 24 }, (_, h) => {
    let factor = 1.0;
    if (h >= 6 && h <= 9) factor = 1.0 - (1.0 - peakFactor) * Math.sin(((h - 6) / 3) * Math.PI);
    else if (h >= 10 && h <= 14) factor = 0.78;
    else if (h >= 15 && h <= 19) factor = 1.0 - (1.0 - peakFactor * 0.9) * Math.sin(((h - 15) / 4) * Math.PI);
    else if (h >= 20 && h <= 23) factor = 0.88 + (h - 20) * 0.03;
    const noiseVal = (rng() - 0.5) * noise;
    return Math.round(freeflowSpeed * (factor + noiseVal));
  });
}

export const HOURLY_DATA = {
  hours: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
  PEMS03: {
    flow: generateHourlyFlow(301, 3200, 1.0, 0.95, 0.06),
    speed: generateHourlySpeed(302, 65, 0.38, 0.04),
    predicted_flow: generateHourlyFlow(303, 3250, 1.02, 0.97, 0.03),
    predicted_speed: generateHourlySpeed(304, 66, 0.39, 0.02),
  },
  PEMS04: {
    flow: generateHourlyFlow(401, 2800, 0.98, 0.92, 0.05),
    speed: generateHourlySpeed(402, 68, 0.42, 0.04),
    predicted_flow: generateHourlyFlow(403, 2820, 0.99, 0.94, 0.03),
    predicted_speed: generateHourlySpeed(404, 69, 0.43, 0.02),
  },
  PEMS07: {
    flow: generateHourlyFlow(701, 2400, 0.96, 0.90, 0.07),
    speed: generateHourlySpeed(702, 70, 0.44, 0.05),
    predicted_flow: generateHourlyFlow(703, 2420, 0.97, 0.91, 0.04),
    predicted_speed: generateHourlySpeed(704, 71, 0.45, 0.03),
  },
  PEMS08: {
    flow: generateHourlyFlow(801, 2100, 0.94, 0.88, 0.06),
    speed: generateHourlySpeed(802, 72, 0.48, 0.04),
    predicted_flow: generateHourlyFlow(803, 2115, 0.95, 0.89, 0.03),
    predicted_speed: generateHourlySpeed(804, 73, 0.49, 0.02),
  },
};

// ============================================================
// MODEL PREDICTION ACCURACY DATA
// ============================================================

export const MODEL_ACCURACY = {
  datasets: ['PEMS03', 'PEMS04', 'PEMS07', 'PEMS08'],
  metrics: {
    MAE: [8.23, 7.85, 9.14, 7.62],
    RMSE: [12.46, 11.93, 13.78, 11.25],
    MAPE: [7.8, 7.2, 8.5, 6.9],
    accuracy: [92.2, 92.8, 91.5, 93.1],
  },
  horizons: ['15分钟', '30分钟', '60分钟'],
  accuracy_by_horizon: {
    PEMS03: [94.5, 92.2, 88.1],
    PEMS04: [95.1, 92.8, 88.9],
    PEMS07: [93.8, 91.5, 87.2],
    PEMS08: [95.4, 93.1, 89.5],
  },
};

// ============================================================
// CONGESTION EVENT DATA
// ============================================================

export const CONGESTION_EVENTS = [
  {
    id: 'CE001', type: '常发性拥堵', location: 'I-405 北行 34.0-34.1', dataset: 'PEMS03',
    startTime: '07:15', endTime: '09:45', duration: 150, severity: 'severe',
    speedDrop: 48, flowImpact: 23, position: [-118.450, 34.050],
    cause: '工作日早高峰通勤流量积聚',
  },
  {
    id: 'CE002', type: '常发性拥堵', location: 'I-10 东行 34.02-34.05', dataset: 'PEMS03',
    startTime: '16:30', endTime: '19:10', duration: 160, severity: 'heavy',
    speedDrop: 42, flowImpact: 19, position: [-118.350, 34.038],
    cause: '晚高峰回程车流集中',
  },
  {
    id: 'CE003', type: '偶发性拥堵', location: 'I-80 东行 Bay Bridge', dataset: 'PEMS04',
    startTime: '08:20', endTime: '10:05', duration: 105, severity: 'heavy',
    speedDrop: 38, flowImpact: 21, position: [-122.395, 37.795],
    cause: '交通事故引发二次排队',
  },
  {
    id: 'CE004', type: '常发性拥堵', location: 'I-215 北行圣贝纳迪诺', dataset: 'PEMS08',
    startTime: '07:00', endTime: '09:30', duration: 150, severity: 'moderate',
    speedDrop: 30, flowImpact: 15, position: [-117.293, 34.140],
    cause: '居民区早高峰出行',
  },
  {
    id: 'CE005', type: '偶发性拥堵', location: 'US-101 好莱坞段', dataset: 'PEMS03',
    startTime: '11:45', endTime: '13:20', duration: 95, severity: 'moderate',
    speedDrop: 25, flowImpact: 12, position: [-118.355, 34.049],
    cause: '道路施工单向封闭',
  },
  {
    id: 'CE006', type: '常发性拥堵', location: 'US-101 半岛段', dataset: 'PEMS04',
    startTime: '17:00', endTime: '19:30', duration: 150, severity: 'heavy',
    speedDrop: 40, flowImpact: 18, position: [-122.415, 37.800],
    cause: '南湾科技园区下班高峰',
  },
];

// ============================================================
// AGENT DECISION DATA
// ============================================================

export const AGENT_DECISIONS = [
  {
    id: 'AD001', agentType: '信控优化', location: 'I-405/I-10 交汇口', dataset: 'PEMS03',
    action: '延长绿灯时长', duration: 45, expectedSpeedUp: 12, confidence: 0.87,
    status: 'executing', time: '08:32:15', position: [-118.452, 34.025],
  },
  {
    id: 'AD002', agentType: '交通管控', location: 'I-10 东行匝道', dataset: 'PEMS03',
    action: '匝道限流管控', duration: 30, expectedSpeedUp: 18, confidence: 0.91,
    status: 'pending', time: '08:34:02', position: [-118.360, 34.036],
  },
  {
    id: 'AD003', agentType: '公共交通', location: '洛杉矶主要公交走廊', dataset: 'PEMS03',
    action: '增加公交运力15%', duration: 120, expectedSpeedUp: 8, confidence: 0.78,
    status: 'completed', time: '07:55:00', position: [-118.250, 34.048],
  },
  {
    id: 'AD004', agentType: '信控优化', location: 'Bay Bridge 入口', dataset: 'PEMS04',
    action: '协调相邻路口信号', duration: 60, expectedSpeedUp: 15, confidence: 0.85,
    status: 'executing', time: '08:25:30', position: [-122.395, 37.795],
  },
  {
    id: 'AD005', agentType: '出行服务', location: '全系统', dataset: 'ALL',
    action: '发布分流建议 (推荐替代路线)', duration: 90, expectedSpeedUp: 10, confidence: 0.82,
    status: 'executing', time: '08:30:00', position: [-118.243, 34.052],
  },
];

// ============================================================
// SIMULATION COMPARISON DATA
// ============================================================

export const SIMULATION_RESULTS = {
  indicators: ['路网平均速度', '拥堵路段比例', '平均延误时间', '通行效率', '总里程产出'],
  before: [38.5, 32.4, 18.2, 64.8, 82.3],
  after: [47.2, 21.8, 13.6, 78.5, 91.7],
  improvement: [22.6, -32.7, -25.3, 21.1, 11.4],
  target: [44.3, 25.9, 14.6, 74.5, 88.0],
};

// ============================================================
// REAL-TIME KPI DATA
// ============================================================

export const REAL_TIME_KPI = {
  tpi: 6.8,
  tpiLabel: '交通运行指数',
  activeVehicles: 284520,
  avgSpeed: 43.2,
  congestionRatio: 28.6,
  incidentCount: 3,
  dataQuality: 98.4,
  systemLoad: 72.3,
  updateTime: new Date().toISOString(),
};

// ============================================================
// LOG STREAM DATA (for Agent System)
// ============================================================

export function generateSystemLogs(count = 30) {
  const rng = seededRandom(42);
  const templates = [
    { level: 'info', msgs: [
      'STGNN 模型推理完成，预测时效 15min，置信度 {conf}%',
      '数据接入层：PEMS{ds} 传感器数据批次已接收，{n} 条记录',
      '特征工程模块：时空对齐处理完成，覆盖 {n} 个检测点',
      '全局协调 Agent：已将任务分配至信控优化 Agent (优先级:高)',
      '仿真评估 Agent：场景模拟完成，路网效率提升预估 {pct}%',
      '缓存刷新：Redis 实时数据更新，延迟 {ms}ms',
    ]},
    { level: 'success', msgs: [
      '信控优化 Agent：I-{seg} 路口绿灯方案已下发，执行率 100%',
      '数据质量检测：异常值过滤完成，清洁率 {conf}%',
      '预测模型评估：MAE={mae}，RMSE={rmse}，符合指标要求',
      '公共交通 Agent：运力调度指令已发送至 {n} 条公交线路',
    ]},
    { level: 'warn', msgs: [
      '检测到 I-{seg} 路段流量异常，已触发偶发拥堵预警',
      '传感器 PEMS{ds}-{id} 数据缺失，已启动插值填充',
      '预测误差超过阈值：PEMS{ds} 30min预测，MAPE={pct}%',
      'Agent 通信延迟 {ms}ms，超过 200ms 告警阈值',
    ]},
    { level: 'error', msgs: [
      'PEMS{ds} 传感器 {id} 连接超时，正在重试...',
      '仿真引擎 SUMO 异常退出，错误码 {code}，正在重启',
    ]},
  ];

  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const typeIdx = rng() < 0.5 ? 0 : rng() < 0.5 ? 1 : rng() < 0.7 ? 2 : 3;
    const type = templates[typeIdx];
    const msgTemplate = type.msgs[Math.floor(rng() * type.msgs.length)];
    const msg = msgTemplate
      .replace('{conf}', Math.floor(88 + rng() * 12))
      .replace('{ds}', ['03', '04', '07', '08'][Math.floor(rng() * 4)])
      .replace('{n}', Math.floor(100 + rng() * 900))
      .replace('{pct}', Math.floor(5 + rng() * 20))
      .replace('{ms}', Math.floor(50 + rng() * 250))
      .replace('{seg}', ['405', '10', '101', '5', '80', '215'][Math.floor(rng() * 6)])
      .replace('{id}', Math.floor(100 + rng() * 800))
      .replace('{mae}', (5 + rng() * 5).toFixed(2))
      .replace('{rmse}', (8 + rng() * 6).toFixed(2))
      .replace('{code}', Math.floor(100 + rng() * 400));
    const ts = new Date(now - (count - i) * 8000 - Math.floor(rng() * 5000));
    return {
      id: `log-${i}`,
      time: ts.toTimeString().slice(0, 8),
      level: type.level,
      msg,
    };
  });
}

// ============================================================
// AGENT CHAT RESPONSES
// ============================================================

export function getAgentResponse(question) {
  const q = question.toLowerCase();

  if (q.includes('预测') || q.includes('预报') || q.includes('forecast')) {
    return `**[STGNN 预测模型 - 实时响应]**

根据当前训练完成的时空图神经网络（STGNN）模型分析：

📊 **短期预测（15分钟）**
- PEMS03 (I-405/I-10 交汇): 拥堵指数 **7.8** ↑0.6，建议提前干预
- PEMS04 (Bay Bridge 入口): 流量预测 **2,340 辆/15min**，进入高峰饱和态
- PEMS08 (I-215 圣贝纳迪诺): 检测到异常流量聚集

📈 **中期预测（30分钟）**
- 洛杉矶全路网平均速度预测降至 **38.2 km/h**（当前 43.2 km/h）
- 拥堵路段比例预测将上升至 **34.1%**

🎯 **模型置信度**: 当前预测区间 **92.3%**，符合系统 ≥85% 精度要求

*全局协调 Agent 已将预测结果同步至各执行 Agent，信控优化方案生成中...*`;
  }

  if (q.includes('拥堵') || q.includes('堵车') || q.includes('congestion')) {
    return `**[拥堵溯源分析 - 实时结果]**

系统已完成拥堵时空传导路径溯源：

🔴 **主要拥堵源头节点**（按严重程度排序）
1. **I-405 × I-10 交汇节点**（PEMS03）- 拥堵指数 8.9，溯源置信度 94.2%
2. **I-10 东行 K56-K58 路段**（PEMS03）- 拥堵指数 7.6
3. **Bay Bridge 西入口**（PEMS04）- 偶发事故引发，置信度 88.1%

📍 **时空传导路径**
I-405北行 → I-10东行 → US-101 → 城区局部扩散

⚠️ **拥堵类型分布**
- 常发性拥堵：68.3%（通勤规律性叠加）
- 偶发性拥堵：31.7%（事故/施工等随机因素）

*传导路径完整度: 96.8%，达到系统 ≥95% 指标*`;
  }

  if (q.includes('数据') || q.includes('pems') || q.includes('传感器') || q.includes('数据集')) {
    return `**[PEMS 数据集信息]**

本系统使用了以下4个加州高速公路性能测量系统（PEMS）数据集：

📦 **PEMS03 - 洛杉矶地区**
- 时间范围：2018年9月1日 ~ 11月30日
- 传感器数量：**358个**（覆盖I-5、I-10、I-405等主要高速公路）
- 记录数量：26,208条，时间间隔5分钟

📦 **PEMS04 - 旧金山湾区**
- 时间范围：2018年1月1日 ~ 2月28日
- 传感器数量：**307个**（湾区高速路网）
- 记录数量：16,992条

📦 **PEMS07 - 加州第七区**
- 时间范围：2017年5月1日 ~ 2018年8月31日
- 传感器数量：**883个**（规模最大）
- 记录数量：28,224条

📦 **PEMS08 - 圣贝纳迪诺**
- 时间范围：2016年7月1日 ~ 8月31日
- 传感器数量：**170个**
- 记录数量：17,856条

*数据质量：异常值识别率 ≥98%，缺失值填充率 ≥90%（已达标）*`;
  }

  if (q.includes('agent') || q.includes('智能体') || q.includes('决策')) {
    return `**[多智能体协同系统状态]**

系统包含 **6类核心智能体**，当前运行状态：

🤖 **全局协调 Agent** [运行中]
- 当前任务：统筹协调各子 Agent 决策，分配优先级
- 处理事件：3个拥堵事件，5个待执行指令

🚦 **信控优化 Agent** [执行中]
- 当前任务：I-405/I-10 交汇信号时序优化
- 预期效果：路口通行效率提升 18-24%

🚔 **交通管控 Agent** [待命]
- 待执行：I-10 东行匝道限流指令（等待确认）

🚌 **公共交通 Agent** [已完成]
- 已发出：洛杉矶主要走廊运力增加 15% 指令

📱 **出行服务 Agent** [运行中]
- 发布：用户分流建议（推荐替代路线 US-101 → SR-134）

🔬 **仿真评估 Agent** [运行中]
- SUMO 仿真验证：当前方案预期路网效率提升 **22.6%**

*所有 Agent 响应时间 ≤ 10s，符合系统指标*`;
  }

  if (q.includes('准确') || q.includes('精度') || q.includes('accuracy') || q.includes('误差')) {
    return `**[模型性能评估报告]**

STGNN 预测模型在各数据集上的评估结果：

| 数据集 | MAE | RMSE | MAPE | 准确率 |
|--------|-----|------|------|--------|
| PEMS03 | 8.23 | 12.46 | 7.8% | **92.2%** |
| PEMS04 | 7.85 | 11.93 | 7.2% | **92.8%** |
| PEMS07 | 9.14 | 13.78 | 8.5% | **91.5%** |
| PEMS08 | 7.62 | 11.25 | 6.9% | **93.1%** |

📊 **多时间粒度准确率**
- 15分钟预测：平均 **94.7%**（最优 PEMS08: 95.4%）
- 30分钟预测：平均 **92.4%**
- 60分钟预测：平均 **88.4%**

✅ 所有数据集均**超过系统要求的 ≥85% 精度指标**`;
  }

  if (q.includes('仿真') || q.includes('simulation') || q.includes('sumo') || q.includes('效果')) {
    return `**[SUMO 仿真验证结果]**

针对当前 Agent 生成的综合管控方案，仿真评估结果如下：

⚡ **核心指标改善**
- 路网平均车速：38.5 → **47.2 km/h** (+22.6%，达标 ✅)
- 拥堵路段比例：32.4% → **21.8%** (-32.7%)
- 平均延误时间：18.2min → **13.6min** (-25.3%，超出目标 ✅)
- 通行效率指数：64.8 → **78.5** (+21.1%)

🎯 **目标达成情况**
- ✅ 高峰路网平均车速提升 **22.6% ≥ 15%**（目标达成）
- ✅ 平均拥堵时长缩短 **25.3% ≥ 20%**（超额完成）

📋 **方案组合**
信控调优 + 匝道限流 + 运力调度 + 出行分流 四位一体联动

*方案生成响应时间：7.3s（要求 ≤10s）✅*`;
  }

  if (q.includes('洛杉矶') || q.includes('los angeles') || q.includes('la')) {
    return `**[PEMS03 - 洛杉矶地区详情]**

🌆 **区域概况**
洛杉矶高速公路网络是全美最繁忙的公路系统之一，覆盖约6,500平方公里都市区。

📍 **数据覆盖**
- **358个检测传感器**，分布于 I-5、I-10、I-405、US-101、I-110、I-210 等主要高速
- 监测数据：交通流量（辆/5min）+ 车速（km/h）+ 占有率
- 采集频率：**5分钟间隔**，共计 26,208 条时序记录

⚠️ **拥堵特征**
- 早高峰（7-9时）：I-405 南北向、I-10 东西向最为严重
- 晚高峰（16-19时）：全路网范围性拥堵，蔓延至二级道路
- 常发性拥堵占比约 **68%**，周一/周五最突出

🔬 **STGNN 训练结论**
模型充分学习洛杉矶网络拓扑特征，在早晚高峰短期预测上表现最优 (MAPE 7.8%)`;
  }

  if (q.includes('旧金山') || q.includes('san francisco') || q.includes('sf') || q.includes('湾区')) {
    return `**[PEMS04 - 旧金山湾区详情]**

🌉 **区域概况**
旧金山湾区是全美最重要的科技经济中心，I-80 海湾大桥（Bay Bridge）是区域主要动脉。

📍 **数据覆盖**
- **307个检测传感器**，覆盖 I-80、US-101、I-880、I-580、I-280、I-680
- 冬季数据（1-2月），交通规律相对稳定，受天气影响较小

⚠️ **拥堵特征**
- Bay Bridge 入口（每日早高峰）是最大拥堵瓶颈节点
- Silicon Valley 方向 US-101 在下午高峰尤为严重
- 偶发性拥堵（事故）比例约 **35%**，高于洛杉矶

🔬 **模型表现**
PEMS04 数据集上 STGNN 准确率最高达 **92.8%**，月平均误差最小（MAE=7.85）`;
  }

  // Default response
  return `**[全局协调 Agent - 智能应答]**

您好！我是城市路网高峰拥堵全链路溯源与多主体协同管控智能决策系统的 AI 助手。

🤖 **我可以回答以下问题：**
- **交通预测**：输入"预测"查看实时15/30/60分钟路网预测
- **拥堵分析**：输入"拥堵"查看溯源分析与传导路径
- **数据集信息**：输入"数据"了解PEMS数据集详情
- **Agent状态**：输入"智能体"查看6类Agent运行状况
- **模型精度**：输入"准确率"查看STGNN模型评估报告
- **仿真结果**：输入"仿真"查看SUMO验证结果
- **地区详情**：输入"洛杉矶"或"旧金山"查看区域分析

💡 **当前系统状态**：所有模块运行正常，实时数据延迟 <3s，模型预测准确率 ≥92%

*请继续提问，我将基于 PEMS 数据集为您提供详细分析...*`;
}

// ============================================================
// WEEK DAY CONGESTION HEATMAP DATA
// ============================================================

export function generateWeeklyHeatmap(seed) {
  const rng = seededRandom(seed);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const data = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      let base = 0.2;
      if (d < 5) {
        if (h >= 7 && h <= 9) base = 0.8 + rng() * 0.2;
        else if (h >= 16 && h <= 19) base = 0.75 + rng() * 0.2;
        else if (h >= 10 && h <= 15) base = 0.5 + rng() * 0.2;
        else if (h >= 6 && h < 7) base = 0.4 + rng() * 0.15;
        else base = 0.15 + rng() * 0.15;
      } else {
        if (h >= 10 && h <= 14) base = 0.55 + rng() * 0.2;
        else if (h >= 15 && h <= 18) base = 0.5 + rng() * 0.2;
        else base = 0.2 + rng() * 0.15;
      }
      data.push([h, d, parseFloat(base.toFixed(3))]);
    }
  }
  return { days, data };
}

export const WEEKLY_HEATMAP = generateWeeklyHeatmap(2025);
