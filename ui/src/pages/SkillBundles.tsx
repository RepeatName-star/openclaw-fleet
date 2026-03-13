import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary, SkillBundleItem } from "../types";

export default function SkillBundlesPage() {
  const api = useMemo(() => createApiClient(), []);
  const [bundles, setBundles] = useState<SkillBundleItem[]>([]);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [installInstanceId, setInstallInstanceId] = useState("");
  const [installSelector, setInstallSelector] = useState("biz.openclaw.io/");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = bundles.find((b) => b.id === selectedId) ?? null;

  const load = useCallback(async () => {
    const [items, inst] = await Promise.all([api.listSkillBundles(), api.listInstances()]);
    setBundles(items);
    setInstances(inst);
    if (!selectedId && items.length) {
      setSelectedId(items[0].id);
    }
    if (!installInstanceId && inst.length) {
      setInstallInstanceId(inst[0].id);
    }
  }, [api, selectedId, installInstanceId]);

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

  function bytesToBase64(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(binary);
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!uploadName.trim()) {
      setError("请输入 bundle 名称");
      return;
    }
    if (!uploadFile) {
      setError("请选择 tar.gz 文件");
      return;
    }
    setBusy(true);
    try {
      const buf = await uploadFile.arrayBuffer();
      const base64 = bytesToBase64(buf);
      await api.uploadSkillBundle({
        name: uploadName.trim(),
        format: "tar.gz",
        content_base64: base64,
      });
      setUploadName("");
      setUploadFile(null);
      setSuccess("上传成功");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function installToInstance() {
    if (!selected) return;
    if (!installInstanceId) {
      setError("请选择目标实例");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.createTask({
        target_type: "instance",
        target_id: installInstanceId,
        action: "fleet.skill_bundle.install",
        payload: { bundleId: selected.id, name: selected.name, sha256: selected.sha256 },
      });
      setSuccess(`已创建任务: ${res.id}`);
      window.location.hash = `#/tasks/${res.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createInstallCampaign() {
    if (!selected) return;
    if (!installSelector.trim()) {
      setError("请输入 selector");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const c = await api.createCampaign({
        name: `install:${selected.name}`,
        selector: installSelector.trim(),
        action: "fleet.skill_bundle.install",
        payload: { bundleId: selected.id, name: selected.name, sha256: selected.sha256 },
        gate: {},
        rollout: {},
      });
      setSuccess(`已创建 Campaign: ${c.id}`);
      window.location.hash = "#/campaigns";
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
          <h1>Skill Bundles</h1>
          <p>上传、分发并安装 tar.gz 技能包。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="card stack">
        <div className="section-title">上传 Bundle</div>
        <form className="grid-two" onSubmit={handleUpload}>
          <label>
            Name
            <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
          </label>
          <label>
            File (tar.gz)
            <input
              type="file"
              accept=".tar.gz,application/gzip"
              onChange={(event) => {
                const f = event.target.files?.[0] ?? null;
                setUploadFile(f);
              }}
            />
          </label>
          <div className="span-two row-actions">
            <button type="submit" disabled={busy}>
              {busy ? "上传中..." : "上传"}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={load}>
              刷新列表
            </button>
          </div>
        </form>
      </div>

      <div className="card stack">
        <div className="section-title">Bundles</div>
        <div className="filters">
          <select
            className="filters-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">选择 bundle</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.id.slice(0, 8)})
              </option>
            ))}
          </select>
          <div className="filters-slot muted">
            {selected ? (
              <span className="mono small">
                sha256={selected.sha256.slice(0, 12)}... size={selected.size_bytes}
              </span>
            ) : null}
          </div>
        </div>

        <div className="table">
          <div
            className="table-row header"
            style={{
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
            }}
          >
            <div>Name</div>
            <div>SHA256</div>
            <div>Size</div>
            <div>Download</div>
          </div>
          {bundles.map((b) => (
            <button
              key={b.id}
              type="button"
              className="table-row clickable"
              style={{
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
                textAlign: "left",
              }}
              onClick={() => setSelectedId(b.id)}
            >
              <div className="stack">
                <div className="strong">{b.name}</div>
                <div className="muted mono small">{b.id}</div>
              </div>
              <div className="mono small">{b.sha256}</div>
              <div className="mono small">{b.size_bytes}</div>
              <div>
                <a
                  className="link"
                  href={`/v1/skill-bundles/${b.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  download
                </a>
              </div>
            </button>
          ))}
          {bundles.length === 0 ? <div className="empty">暂无 bundle。</div> : null}
        </div>
      </div>

      {selected ? (
        <div className="card stack">
          <div className="section-title">Install Helper</div>
          <div className="grid-two">
            <label>
              Target Instance
              <select value={installInstanceId} onChange={(event) => setInstallInstanceId(event.target.value)}>
                <option value="">选择实例</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Campaign Selector
              <input value={installSelector} onChange={(event) => setInstallSelector(event.target.value)} />
            </label>
          </div>
          <div className="row-actions">
            <button type="button" disabled={busy} onClick={installToInstance}>
              安装到实例 (task)
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={createInstallCampaign}>
              创建安装 Campaign
            </button>
            <div className="hint">
              payload: <span className="mono">{`{bundleId,name,sha256}`}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
