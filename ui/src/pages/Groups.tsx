import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { GroupItem, GroupMatchItem } from "../types";

export default function GroupsPage() {
  const api = useMemo(() => createApiClient(), []);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [name, setName] = useState("");
  const [selector, setSelector] = useState("biz.openclaw.io/");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<
    Record<
      string,
      { name: string; selector: string; description: string }
    >
  >({});
  const [matchesFor, setMatchesFor] = useState<string | null>(null);
  const [matches, setMatches] = useState<GroupMatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const items = await api.listGroups();
    setGroups(items);
  }, [api]);

  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        await loadGroups();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [loadGroups]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !selector.trim()) {
      setError("name/selector 不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createGroup({
        name: name.trim(),
        selector: selector.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
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
    if (!draft) return;
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

  async function handleDelete(id: string) {
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

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Groups</h1>
          <p>Group 是命名 Selector（K8s label selector）。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="card stack">
        <div className="section-title">创建分组</div>
        <form className="grid-two" onSubmit={handleCreate}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Selector
            <input value={selector} onChange={(event) => setSelector(event.target.value)} />
          </label>
          <label className="span-two">
            Description (可选)
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
        <div className="section-title">Groups</div>
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
                  <button type="button" className="ghost" disabled={busy} onClick={() => showMatches(group)}>
                    Matches
                  </button>
                  {isEditing ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => saveEdit(group.id)}>
                        保存
                      </button>
                      <button type="button" className="ghost" disabled={busy} onClick={() => cancelEdit(group.id)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ghost" disabled={busy} onClick={() => startEdit(group)}>
                        编辑
                      </button>
                      <button type="button" className="ghost" disabled={busy} onClick={() => handleDelete(group.id)}>
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
          <div className="section-title">Matches</div>
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
            {matches.map((m) => (
              <div
                key={m.id}
                className="table-row"
                style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}
              >
                <div>{m.name}</div>
                <div className="mono">{m.id}</div>
              </div>
            ))}
            {matches.length === 0 ? <div className="empty">暂无匹配实例。</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
