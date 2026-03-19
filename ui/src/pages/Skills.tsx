import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary, SkillBundleItem } from "../types";

type SkillsPageProps = {
  defaultInstallOpen?: boolean;
};

function primaryInstanceName(instance: InstanceSummary) {
  return instance.display_name || instance.name;
}

export default function SkillsPage({ defaultInstallOpen = false }: SkillsPageProps) {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [bundles, setBundles] = useState<SkillBundleItem[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [installInstanceId, setInstallInstanceId] = useState("");
  const [installSelector, setInstallSelector] = useState("biz.openclaw.io/");
  const [showInstall, setShowInstall] = useState(defaultInstallOpen);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedBundle = bundles.find((item) => item.id === selectedBundleId) ?? null;
  const skillsList = Array.isArray(snapshot?.skills)
    ? snapshot.skills
    : Array.isArray(snapshot)
      ? snapshot
      : [];

  const loadMeta = useCallback(async () => {
    const [instanceItems, bundleItems] = await Promise.all([
      api.listInstances(),
      api.listSkillBundles(),
    ]);
    setInstances(instanceItems);
    setBundles(bundleItems);
    if (!selectedId && instanceItems.length) {
      setSelectedId(instanceItems[0].id);
    }
    if (!installInstanceId && instanceItems.length) {
      setInstallInstanceId(instanceItems[0].id);
    }
    if (!selectedBundleId && bundleItems.length) {
      setSelectedBundleId(bundleItems[0].id);
    } else if (selectedBundleId && !bundleItems.some((item) => item.id === selectedBundleId)) {
      setSelectedBundleId(bundleItems[0]?.id ?? "");
    }
  }, [api, installInstanceId, selectedBundleId, selectedId]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setError(null);
        await loadMeta();
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [loadMeta]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedId) {
        return;
      }
      setLoading(true);
      try {
        const res = await api.getInstanceSkills(selectedId);
        if (!active) {
          return;
        }
        setSnapshot(res.skills);
        setUpdatedAt(res.updated_at ?? null);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [api, selectedId]);

  function bytesToBase64(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(binary);
  }

  async function triggerStatus() {
    if (!selectedId) {
      return;
    }
    try {
      await api.createTask({
        target_type: "instance",
        target_id: selectedId,
        task_name: "刷新技能状态",
        action: "skills.status",
        payload: {},
      });
      setSuccess("已触发技能状态刷新任务");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateSkill(skillKey: string, enabled: boolean) {
    if (!selectedId) {
      return;
    }
    try {
      await api.createTask({
        target_type: "instance",
        target_id: selectedId,
        task_name: `${enabled ? "启用" : "禁用"} Skill`,
        action: "skills.update",
        payload: { skillKey, enabled },
      });
      setSuccess(`已创建 ${enabled ? "启用" : "禁用"} 任务`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
      await loadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function installToInstance() {
    if (!selectedBundle) {
      return;
    }
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
        task_name: `安装 Skill: ${selectedBundle.name}`,
        action: "fleet.skill_bundle.install",
        payload: {
          bundleId: selectedBundle.id,
          name: selectedBundle.name,
          sha256: selectedBundle.sha256,
        },
      });
      setSuccess(`已创建任务: ${res.id}`);
      if (typeof window !== "undefined") {
        window.location.hash = `#/tasks/${res.id}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createInstallCampaign() {
    if (!selectedBundle) {
      return;
    }
    if (!installSelector.trim()) {
      setError("请输入 selector");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const campaign = await api.createCampaign({
        name: `install:${selectedBundle.name}`,
        selector: installSelector.trim(),
        action: "fleet.skill_bundle.install",
        payload: {
          bundleId: selectedBundle.id,
          name: selectedBundle.name,
          sha256: selectedBundle.sha256,
        },
        gate: {},
        rollout: {},
      });
      setSuccess(`已创建 Campaign: ${campaign.id}`);
      if (typeof window !== "undefined") {
        window.location.hash = "#/campaigns";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedBundle() {
    if (!selectedBundle) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.deleteSkillBundle(selectedBundle.id);
      setSuccess(`已删除 Bundle: ${selectedBundle.name}`);
      setSelectedBundleId("");
      await loadMeta();
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
          <h1>技能管理</h1>
          <p>查看实例技能快照，并在同一处上传、安装和分发 Skill Bundle。</p>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={triggerStatus}>
            刷新技能状态
          </button>
          <button type="button" onClick={() => setShowInstall(true)}>
            安装 Skill
          </button>
        </div>
      </header>

      <div className="filters">
        <select
          className="filters-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">选择实例</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {primaryInstanceName(instance)}
            </option>
          ))}
        </select>
        <div className="filters-slot">
          {updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString()}` : ""}
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}
      {loading ? <div className="hint">加载中...</div> : null}

      <div className="overview-grid">
        <article className="card metric-card">
          <div className="label">当前技能数</div>
          <div className="metric-value">{skillsList.length} 个 Skill</div>
          <p className="muted">当前实例技能快照中的可见 Skill 数量。</p>
        </article>
        <article className="card metric-card">
          <div className="label">Bundle 仓库</div>
          <div className="metric-value">{bundles.length} 个 Bundle</div>
          <p className="muted">可直接上传、删除并分发到指定实例或 Campaign。</p>
        </article>
        <article className="card metric-card">
          <div className="label">当前实例</div>
          <div className="metric-value">{selectedId ? primaryInstanceName(instances.find((item) => item.id === selectedId) ?? { id: "", name: "-", updated_at: "", online: false }) : "-"}</div>
          <p className="muted">技能更新、状态刷新和安装任务默认指向当前选中的实例。</p>
        </article>
      </div>

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>Skill</div>
            <div>状态</div>
            <div>来源</div>
            <div>操作</div>
          </div>
          {skillsList.map((skill: any) => (
            <div key={skill.skillKey ?? skill.name} className="table-row">
              <div>{skill.skillKey ?? skill.name}</div>
              <div>
                <span className={`badge ${skill.disabled ? "warn" : "ok"}`}>
                  {skill.disabled ? "禁用" : "启用"}
                </span>
              </div>
              <div className="muted">{skill.source ?? "-"}</div>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void updateSkill(skill.skillKey ?? skill.name, true)}
                >
                  启用
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void updateSkill(skill.skillKey ?? skill.name, false)}
                >
                  禁用
                </button>
              </div>
            </div>
          ))}
          {skillsList.length === 0 ? <div className="empty">暂无技能快照，请点击刷新。</div> : null}
        </div>
      </div>

      {showInstall ? (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">上传 Skill Bundle</div>
                <div className="muted small">在同一处上传、删除并安装到实例或 Campaign。</div>
              </div>
              <button type="button" className="ghost" onClick={() => setShowInstall(false)}>
                关闭
              </button>
            </header>

            <div className="modal-body">
              <div className="card stack">
                <form className="grid-two" onSubmit={handleUpload}>
                  <label>
                    Name
                    <input
                      value={uploadName}
                      onChange={(event) => setUploadName(event.target.value)}
                    />
                  </label>
                  <label>
                    File (tar.gz)
                    <input
                      type="file"
                      accept=".tar.gz,application/gzip"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setUploadFile(file);
                      }}
                    />
                  </label>
                  <div className="span-two row-actions">
                    <button type="submit" disabled={busy}>
                      {busy ? "上传中..." : "上传"}
                    </button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void loadMeta()}>
                      刷新列表
                    </button>
                  </div>
                </form>
              </div>

              <div className="card stack">
                <div className="filters">
                  <select
                    className="filters-select"
                    value={selectedBundleId}
                    onChange={(event) => setSelectedBundleId(event.target.value)}
                  >
                    <option value="">选择 bundle</option>
                    {bundles.map((bundle) => (
                      <option key={bundle.id} value={bundle.id}>
                        {bundle.name} ({bundle.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                  <div className="filters-slot muted">
                    {selectedBundle ? (
                      <span className="mono small">
                        sha256={selectedBundle.sha256.slice(0, 12)}... size={selectedBundle.size_bytes}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="table">
                  <div
                    className="table-row header"
                    style={{
                      gridTemplateColumns:
                        "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
                    }}
                  >
                    <div>Name</div>
                    <div>SHA256</div>
                    <div>Size</div>
                    <div>Download</div>
                  </div>
                  {bundles.map((bundle) => (
                    <button
                      key={bundle.id}
                      type="button"
                      className="table-row clickable"
                      style={{
                        gridTemplateColumns:
                          "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
                        textAlign: "left",
                      }}
                      onClick={() => setSelectedBundleId(bundle.id)}
                    >
                      <div className="stack">
                        <div className="strong">{bundle.name}</div>
                        <div className="muted mono small">{bundle.id}</div>
                      </div>
                      <div className="mono small">{bundle.sha256}</div>
                      <div className="mono small">{bundle.size_bytes}</div>
                      <div>
                        <a
                          className="link"
                          href={`/v1/skill-bundles/${bundle.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          download
                        </a>
                      </div>
                    </button>
                  ))}
                  {bundles.length === 0 ? <div className="empty">暂无 bundle。</div> : null}
                </div>

                {selectedBundle ? (
                  <>
                    <div className="grid-two">
                      <label>
                        Target Instance
                        <select
                          value={installInstanceId}
                          onChange={(event) => setInstallInstanceId(event.target.value)}
                        >
                          <option value="">选择实例</option>
                          {instances.map((instance) => (
                            <option key={instance.id} value={instance.id}>
                              {primaryInstanceName(instance)} ({instance.id.slice(0, 8)})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Campaign Selector
                        <input
                          value={installSelector}
                          onChange={(event) => setInstallSelector(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="row-actions">
                      <button type="button" disabled={busy} onClick={() => void installToInstance()}>
                        安装到实例 (task)
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void createInstallCampaign()}
                      >
                        创建安装 Campaign
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void deleteSelectedBundle()}
                      >
                        删除 bundle
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
