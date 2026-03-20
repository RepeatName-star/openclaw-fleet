import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { GroupItem, GroupMatchItem, InstanceLabelItem, InstanceSummary } from "../types";

function primaryInstanceName(instance: InstanceSummary) {
  return instance.display_name || instance.name;
}

function primaryMatchName(instance: GroupMatchItem) {
  return instance.display_name || instance.name;
}

export default function TargetingPage() {
  const api = useMemo(() => createApiClient(), []);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupSelector, setGroupSelector] = useState("biz.openclaw.io/");
  const [groupDescription, setGroupDescription] = useState("");
  const [editing, setEditing] = useState<
    Record<string, { name: string; selector: string; description: string }>
  >({});
  const [matchesFor, setMatchesFor] = useState<string | null>(null);
  const [matches, setMatches] = useState<GroupMatchItem[]>([]);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [labels, setLabels] = useState<InstanceLabelItem[]>([]);
  const [labelKey, setLabelKey] = useState("biz.openclaw.io/");
  const [labelValue, setLabelValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const items = await api.listGroups();
    setGroups(items);
  }, [api]);

  const loadInstances = useCallback(async () => {
    const data = await api.listInstances();
    setInstances(data);
    if (!selectedInstanceId && data.length) {
      setSelectedInstanceId(data[0].id);
    }
  }, [api, selectedInstanceId]);

  const loadLabels = useCallback(async () => {
    if (!selectedInstanceId) {
      return;
    }
    const items = await api.getInstanceLabels(selectedInstanceId);
    setLabels(items);
  }, [api, selectedInstanceId]);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        setError(null);
        await Promise.all([loadGroups(), loadInstances()]);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadGroups, loadInstances]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!selectedInstanceId) {
        return;
      }
      try {
        setError(null);
        await loadLabels();
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadLabels, selectedInstanceId]);

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || !groupSelector.trim()) {
      setError("name/selector 不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createGroup({
        name: groupName.trim(),
        selector: groupSelector.trim(),
        description: groupDescription.trim() || undefined,
      });
      setGroupName("");
      setGroupDescription("");
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(group: GroupItem) {
    setEditing((prev) => ({
      ...prev,
      [group.id]: {
        name: group.name,
        selector: group.selector,
        description: group.description ?? "",
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(id: string) {
    const draft = editing[id];
    if (!draft) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patchGroup(id, {
        name: draft.name.trim() || undefined,
        selector: draft.selector.trim() || undefined,
        description: draft.description.trim() || undefined,
      });
      cancelEdit(id);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteGroup(id);
      if (matchesFor === id) {
        setMatchesFor(null);
        setMatches([]);
      }
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function showMatches(group: GroupItem) {
    setBusy(true);
    setError(null);
    try {
      const items = await api.getGroupMatches(group.id);
      setMatchesFor(group.id);
      setMatches(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpsertLabel(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInstanceId) {
      setError("请选择实例");
      return;
    }
    if (!labelKey.trim()) {
      setError("Key 不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.upsertInstanceLabel(selectedInstanceId, {
        key: labelKey.trim(),
        value: labelValue,
      });
      setLabelValue("");
      await loadLabels();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLabel(item: InstanceLabelItem) {
    if (!selectedInstanceId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteInstanceLabel(selectedInstanceId, item.key);
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
          <h1>分组与标签</h1>
          <p>在同一处维护 Selector 分组、实例标签与匹配预览，减少页面切换。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="card stack">
        <div className="section-title">创建分组</div>
        <form className="grid-two" onSubmit={handleCreateGroup}>
          <label>
            Name
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
          </label>
          <label>
            Selector
            <input
              value={groupSelector}
              onChange={(event) => setGroupSelector(event.target.value)}
            />
          </label>
          <label className="span-two">
            Description (可选)
            <input
              value={groupDescription}
              onChange={(event) => setGroupDescription(event.target.value)}
            />
          </label>
          <div className="span-two row-actions">
            <button type="submit" disabled={busy}>
              {busy ? "提交中..." : "创建"}
            </button>
            <div className="hint">
              示例：<span className="mono">biz.openclaw.io/env=prod</span>，<span className="mono">biz.openclaw.io/region in (bj,sg)</span>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-title">分组</div>
        <div className="table">
          <div
            className="table-row header"
            style={{
              gridTemplateColumns:
                "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr)",
            }}
          >
            <div>Name</div>
            <div>Selector</div>
            <div>Description</div>
            <div>Actions</div>
          </div>
          {groups.map((group) => {
            const draft = editing[group.id];
            const isEditing = Boolean(draft);
            return (
              <div
                key={group.id}
                className="table-row"
                style={{
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr)",
                }}
              >
                <div className="stack">
                  {isEditing ? (
                    <input
                      className="inline-input"
                      value={draft!.name}
                      onChange={(event) =>
                        setEditing((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], name: event.target.value },
                        }))
                      }
                    />
                  ) : (
                    <div className="strong">{group.name}</div>
                  )}
                  <div className="muted mono small">{group.id}</div>
                </div>
                <div>
                  {isEditing ? (
                    <input
                      className="inline-input"
                      value={draft!.selector}
                      onChange={(event) =>
                        setEditing((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], selector: event.target.value },
                        }))
                      }
                    />
                  ) : (
                    <div className="mono">{group.selector}</div>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <input
                      className="inline-input"
                      value={draft!.description}
                      onChange={(event) =>
                        setEditing((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], description: event.target.value },
                        }))
                      }
                    />
                  ) : (
                    <div className="muted">{group.description ?? "-"}</div>
                  )}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void showMatches(group)}
                  >
                    Matches
                  </button>
                  {isEditing ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => void saveEdit(group.id)}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => cancelEdit(group.id)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => startEdit(group)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void handleDeleteGroup(group.id)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {groups.length === 0 ? <div className="empty">暂无分组。</div> : null}
        </div>
      </div>

      {matchesFor ? (
        <div className="card">
          <div className="section-title">匹配预览</div>
          <div className="hint">
            Group: <span className="mono">{matchesFor}</span>
          </div>
          <div className="table">
            <div
              className="table-row header"
              style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}
            >
              <div>Name</div>
              <div>Instance ID</div>
            </div>
            {matches.map((item) => (
              <div
                key={item.id}
                className="table-row"
                style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}
              >
                <div className="stack">
                  <div>{primaryMatchName(item)}</div>
                  {item.display_name && item.display_name !== item.name ? (
                    <div className="muted mono small">{item.name}</div>
                  ) : null}
                </div>
                <div className="mono">{item.id}</div>
              </div>
            ))}
            {matches.length === 0 ? <div className="empty">暂无匹配实例。</div> : null}
          </div>
        </div>
      ) : null}

      <div className="card stack">
        <div className="section-title">实例标签</div>
        <div className="filters">
          <select
            className="filters-select"
            value={selectedInstanceId}
            onChange={(event) => setSelectedInstanceId(event.target.value)}
          >
            <option value="">选择实例</option>
            {instances.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {primaryInstanceName(instance)}
              </option>
            ))}
          </select>
          <div className="filters-slot">
            <button
              type="button"
              className="ghost"
              onClick={() => void loadLabels()}
              disabled={!selectedInstanceId || busy}
            >
              刷新
            </button>
          </div>
        </div>

        <form className="grid-two" onSubmit={handleUpsertLabel}>
          <label>
            Key
            <input value={labelKey} onChange={(event) => setLabelKey(event.target.value)} />
          </label>
          <label>
            Value
            <input value={labelValue} onChange={(event) => setLabelValue(event.target.value)} />
          </label>
          <div className="span-two row-actions">
            <button type="submit" disabled={!selectedInstanceId || busy}>
              {busy ? "提交中..." : "保存"}
            </button>
            <div className="hint">
              仅允许写入 <span className="mono">biz.openclaw.io/*</span>；<span className="mono">openclaw.io/*</span>{" "}
              为系统标签（只读）。
            </div>
          </div>
        </form>

        <div className="table">
          <div
            className="table-row header"
            style={{
              gridTemplateColumns:
                "minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
            }}
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
              style={{
                gridTemplateColumns:
                  "minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
              }}
            >
              <div className="mono">{item.key}</div>
              <div className="mono">{item.value}</div>
              <div className="muted">{item.source}</div>
              <div className="row-actions">
                {item.source === "business" ? (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void handleDeleteLabel(item)}
                  >
                    删除
                  </button>
                ) : (
                  <span className="muted small">readonly</span>
                )}
              </div>
            </div>
          ))}
          {!selectedInstanceId ? <div className="empty">请选择实例。</div> : null}
          {selectedInstanceId && labels.length === 0 ? <div className="empty">暂无标签。</div> : null}
        </div>
      </div>
    </section>
  );
}
