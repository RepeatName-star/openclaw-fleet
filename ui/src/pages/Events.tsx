import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { ArtifactItem, CampaignItem, EventItem, InstanceSummary } from "../types";

export default function EventsPage() {
  const api = useMemo(() => createApiClient(), []);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [eventType, setEventType] = useState("");
  const [limit, setLimit] = useState("200");
  const [items, setItems] = useState<EventItem[]>([]);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [artifact, setArtifact] = useState<ArtifactItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function readHashQuery(): Record<string, string> {
    if (typeof window === "undefined") return {};
    const raw = window.location.hash || "";
    const idx = raw.indexOf("?");
    if (idx === -1) return {};
    const qs = raw.slice(idx + 1);
    const params = new URLSearchParams(qs);
    const out: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      out[k] = v;
    }
    return out;
  }

  useEffect(() => {
    const q = readHashQuery();
    if (q.campaign_id) setCampaignId(q.campaign_id);
    if (q.instance_id) setInstanceId(q.instance_id);
    if (q.event_type) setEventType(q.event_type);
  }, []);

  const loadMeta = useCallback(async () => {
    const [cs, is] = await Promise.all([api.listCampaigns({ include_deleted: true }), api.listInstances()]);
    setCampaigns(cs);
    setInstances(is);
  }, [api]);

  const load = useCallback(async () => {
    const parsedLimit = Number(limit);
    const lim = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    const data = await api.listEvents({
      campaign_id: campaignId || undefined,
      instance_id: instanceId || undefined,
      event_type: eventType || undefined,
      limit: lim,
    });
    setItems(data);
  }, [api, campaignId, instanceId, eventType, limit]);

  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        await loadMeta();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadMeta]);

  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        await load();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [load]);

  function buildExportUrl(format: "jsonl" | "csv") {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    if (instanceId) params.set("instance_id", instanceId);
    if (eventType) params.set("event_type", eventType);
    params.set("format", format);
    const qs = params.toString();
    return `/v1/events/export${qs ? `?${qs}` : ""}`;
  }

  function exportNow(format: "jsonl" | "csv") {
    if (typeof window === "undefined") return;
    window.open(buildExportUrl(format), "_blank", "noopener,noreferrer");
  }

  async function openDetails(ev: EventItem) {
    setSelected(ev);
    setArtifact(null);
    if (!ev.artifact_id) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.getArtifact(ev.artifact_id);
      setArtifact(data);
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
          <h1>Events</h1>
          <p>审计事件流（支持筛选与导出）。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="card stack">
        <div className="section-title">Filters</div>
        <div className="grid-two">
          <label>
            Campaign
            <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">(all)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "deleted" ? " [deleted]" : ""}
                  {` (${c.id.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Instance
            <select value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>
              <option value="">(all)</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Event Type
            <input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="exec.finished" />
          </label>
          <label>
            Limit
            <input value={limit} onChange={(event) => setLimit(event.target.value)} />
          </label>
        </div>
        <div className="row-actions">
          <button type="button" disabled={busy} onClick={load}>
            查询
          </button>
          <button type="button" className="ghost" onClick={() => exportNow("jsonl")}>
            导出 JSONL
          </button>
          <button type="button" className="ghost" onClick={() => exportNow("csv")}>
            导出 CSV
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Events</div>
        <div className="table">
          <div
            className="table-row header"
            style={{
              gridTemplateColumns:
                "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)",
            }}
          >
            <div>TS</div>
            <div>Type</div>
            <div>Instance</div>
            <div>Campaign</div>
            <div>Artifact</div>
          </div>
          {items.map((ev) => (
            <button
              key={ev.id}
              type="button"
              className="table-row clickable"
              style={{
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)",
                textAlign: "left",
              }}
              onClick={() => openDetails(ev)}
            >
              <div className="mono small">{new Date(ev.ts).toLocaleString()}</div>
              <div className="mono">{ev.event_type}</div>
              <div className="stack">
                <div>{ev.instance_name ?? "-"}</div>
                <div className="muted mono small">{ev.instance_id ? ev.instance_id.slice(0, 8) : "-"}</div>
              </div>
              <div className="stack">
                <div className="muted mono small">{ev.campaign_id ? ev.campaign_id.slice(0, 8) : "-"}</div>
                <div className="muted mono small">
                  gen: {ev.campaign_generation ?? "-"}
                </div>
              </div>
              <div className="mono small">{ev.artifact_id ? ev.artifact_id.slice(0, 8) : "-"}</div>
            </button>
          ))}
          {items.length === 0 ? <div className="empty">暂无事件。</div> : null}
        </div>
      </div>

      {selected ? (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">Event Detail</div>
                <div className="muted mono small">{selected.id}</div>
              </div>
              <button type="button" className="ghost" onClick={() => setSelected(null)}>
                关闭
              </button>
            </header>
            <div className="modal-body">
              <div className="grid-two">
                <div>
                  <div className="label">TS</div>
                  <div className="mono small">{new Date(selected.ts).toLocaleString()}</div>
                </div>
                <div>
                  <div className="label">Type</div>
                  <div className="mono small">{selected.event_type}</div>
                </div>
                <div>
                  <div className="label">Instance</div>
                  <div className="mono small">{selected.instance_name ?? "-"}</div>
                </div>
                <div>
                  <div className="label">Campaign</div>
                  <div className="mono small">{selected.campaign_id ?? "-"}</div>
                </div>
              </div>
              <div>
                <div className="label">Event</div>
                <pre className="code-block">{JSON.stringify(selected, null, 2)}</pre>
              </div>
              {selected.artifact_id ? (
                <div>
                  <div className="label">Artifact</div>
                  {artifact ? (
                    <pre className="code-block">{JSON.stringify(artifact, null, 2)}</pre>
                  ) : (
                    <div className="hint">{busy ? "加载 artifact 中..." : "无 artifact 内容或加载失败"}</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
