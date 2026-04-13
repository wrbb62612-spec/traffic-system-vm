const API_BASE = "http://127.0.0.1:8000";

export async function getDatastoreHealth() {
  const res = await fetch(`${API_BASE}/datastore/health`);
  if (!res.ok) throw new Error("获取 datastore health 失败");
  return res.json();
}

export async function getCurrentFeature(nodeId) {
  const res = await fetch(`${API_BASE}/datastore/feature/current/${nodeId}`);
  if (!res.ok) throw new Error("获取 current feature 失败");
  return res.json();
}

export async function getHistoryFeature(nodeId, steps = 12) {
  const res = await fetch(
    `${API_BASE}/datastore/feature/history/${nodeId}?steps=${steps}`
  );
  if (!res.ok) throw new Error("获取 history feature 失败");
  return res.json();
}

export async function getDcrnnInputPreview(nodeIds = ["1001"], steps = 12) {
  const qs = new URLSearchParams({
    node_ids: nodeIds.join(","),
    steps: String(steps),
  });
  const res = await fetch(`${API_BASE}/datastore/feature/dcrnn-input?${qs}`);
  if (!res.ok) throw new Error("获取 DCRNN 输入预览失败");
  return res.json();
}

export async function runPredictFromFeatureStore(nodeIds = ["1001"], steps = 12) {
  const qs = new URLSearchParams({
    node_ids: nodeIds.join(","),
    steps: String(steps),
  });
  const res = await fetch(
    `${API_BASE}/datastore/predict/from-feature-store?${qs}`,
    {
      method: "POST",
    }
  );
  if (!res.ok) throw new Error("从 feature store 触发预测失败");
  return res.json();
}

export async function getLatestPredictionCache(nodeIds = ["1001"]) {
  const qs = new URLSearchParams({
    node_ids: nodeIds.join(","),
  });
  const res = await fetch(
    `${API_BASE}/datastore/predict/cache/latest?${qs}`
  );
  if (!res.ok) throw new Error("获取最新预测缓存失败");
  return res.json();
}

export async function getPredictionPointsFromCache(nodeIds = ["1001"], horizon = 1) {
  const cache = await getLatestPredictionCache(nodeIds);

  if (!cache?.exists || !cache?.data?.infer_service_result?.result) {
    return [];
  }

  const horizons = cache.data.infer_service_result.result;
  const target = horizons.find((item) => item.horizon === horizon);

  return target?.points || [];
}

export async function writeHistoryFeature(nodeId, payload) {
  const res = await fetch(`${API_BASE}/datastore/feature/history/${nodeId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("写入 history feature 失败");
  return res.json();
}