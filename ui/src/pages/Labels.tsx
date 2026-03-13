import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceLabelItem, InstanceSummary } from "../types";

export default function LabelsPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [labels, setLabels] = useState<InstanceLabelItem[]>([]);
  const [key, setKey] = useState("biz.openclaw.io/");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadInstances = useCallback(async () => {
    const data = await api.listInstances();
    setInstances(data);
    if (!selectedId && data.length) {
      setSelectedId(data[0].id);
    }
  }, [api, selectedId]);

  const loadLabels = useCallback(async () => {
    if (!selectedId) return;
    const items = await api.getInstanceLabels(selectedId);
    setLabels(items);
  }, [api, selectedId]);

  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        await loadInstances();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadInstances]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!selectedId) return;
      setError(null);
      try {
        await loadLabels();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadLabels, selectedId]);

  async function handleUpsert(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) {
      setError("请选择实例");
      return;
    }
    if (!key.trim()) {
      setError("Key 不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.upsertInstanceLabel(selectedId, { key: key.trim(), value });
      await loadLabels();
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: InstanceLabelItem) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteInstanceLabel(selectedId, item.key);
      await loadLabels();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Labels</h1>
          <p>管理实例的业务标签（biz.openclaw.io/*）。</p>
        </div>
      </header>

      <div className="filters">
        <select
          className="filters-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">选择实例</option>
          {instances.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
        <div className="filters-slot">
          <button type="button" className="ghost" onClick={loadLabels} disabled={!selectedId || busy}>
            刷新
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card stack">
        <div className="section-title">Upsert Label</div>
        <form className="grid-two" onSubmit={handleUpsert}>
          <label>
            Key
            <input value={key} onChange={(event) => setKey(event.target.value)} />
          </label>
          <label>
            Value
            <input value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <div className="span-two row-actions">
            <button type="submit" disabled={!selectedId || busy}>
              {busy ? "提交中..." : "保存"}
            </button>
            <div className="hint">
              仅允许写入 <span className="mono">biz.openclaw.io/*</span>；<span className="mono">openclaw.io/*</span>{" "}
              为系统标签（只读）。
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-title">Current Labels</div>
        <div className="table">
          <div
            className="table-row header"
            style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)" }}
          >
            <div>Key</div>
            <div>Value</div>
            <div>Source</div>
            <div>Action</div>
          </div>
          {labels.map((item) => (
            <div
              key={item.key}
              className="table-row"
              style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)" }}
            >
              <div className="mono">{item.key}</div>
              <div className="mono">{item.value}</div>
              <div className="muted">{item.source}</div>
              <div className="row-actions">
                {item.source === "business" ? (
                  <button type="button" className="ghost" disabled={busy} onClick={() => handleDelete(item)}>
                    删除
                  </button>
                ) : (
                  <span className="muted small">readonly</span>
                )}
              </div>
            </div>
          ))}
          {!selectedId ? <div className="empty">请选择实例。</div> : null}
          {selectedId && labels.length === 0 ? <div className="empty">暂无标签。</div> : null}
        </div>
      </div>
    </section>
  );
}
