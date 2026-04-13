import { useState } from "react";
import {
  getDatastoreHealth,
  getCurrentFeature,
  getHistoryFeature,
  getDcrnnInputPreview,
  runPredictFromFeatureStore,
  getLatestPredictionCache,
  writeHistoryFeature,
} from "../api/datastore";

export default function FeatureStoreDebugPanel() {
  const [nodeId, setNodeId] = useState("1001");
  const [steps, setSteps] = useState(12);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runAction = async (fn) => {
    try {
      setLoading(true);
      const data = await fn();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #163d63",
        borderRadius: 8,
        marginTop: 8,
        background: "rgba(4, 18, 38, 0.9)",
      }}
    >
      <h3 style={{ marginTop: 0, color: "#8fe7ff" }}>Feature Store 调试面板</h3>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <input
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          placeholder="node id"
        />
        <input
          type="number"
          value={steps}
          onChange={(e) => setSteps(Number(e.target.value))}
          placeholder="steps"
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => runAction(() => getDatastoreHealth())}>Health</button>
        <button onClick={() => runAction(() => getCurrentFeature(nodeId))}>Current</button>
        <button onClick={() => runAction(() => getHistoryFeature(nodeId, steps))}>History</button>
        <button onClick={() => runAction(() => getDcrnnInputPreview([nodeId], steps))}>
          DCRNN Input
        </button>
        <button
          onClick={() =>
            runAction(async () => {
              await runPredictFromFeatureStore([nodeId], steps);
              return await getLatestPredictionCache([nodeId]);
            })
          }
        >
          Run Predict
        </button>
        <button onClick={() => runAction(() => getLatestPredictionCache([nodeId]))}>
          Latest Cache
        </button>
        <button
          onClick={() =>
            runAction(() =>
              writeHistoryFeature(nodeId, {
                speed: Number((30 + Math.random() * 30).toFixed(1)),
                time_of_day: Number(Math.random().toFixed(4)),
              })
            )
          }
        >
          Write Random History
        </button>
      </div>

      <div>
        {loading ? (
          <p style={{ color: "#8fe7ff" }}>加载中...</p>
        ) : (
          <pre
            style={{
              maxHeight: 400,
              overflow: "auto",
              background: "#07111d",
              color: "#00ff9c",
              padding: 12,
              borderRadius: 6,
              marginBottom: 0,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}