import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";
import Filters from "../components/Filters";
import TaskModal from "../components/TaskModal";

export default function InstancesPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api.listInstances();
        if (!active) return;
        setInstances(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);

  const filtered = instances.filter((instance) => {
    const value = `${instance.name} ${instance.id}`.toLowerCase();
    return value.includes(query.toLowerCase());
  });

  function handleEdit(id: string, value: string) {
    setEditing((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSave(id: string) {
    const value = editing[id];
    if (!value) return;
    try {
      await api.updateInstance(id, { control_ui_url: value });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Instances</h1>
          <p>管理已注册的 OpenClaw 实例。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTargetId(undefined);
            setModalOpen(true);
          }}
        >
          创建任务
        </button>
      </header>

      <Filters
        query={query}
        onQueryChange={setQuery}
        placeholder="搜索实例名称/ID"
      />

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>名称</div>
            <div>状态</div>
            <div>最后心跳</div>
            <div>控制台</div>
            <div>操作</div>
          </div>
          {filtered.map((instance) => (
            <div key={instance.id} className="table-row">
              <div>
                <div className="strong">{instance.name}</div>
                <div className="muted">{instance.id}</div>
              </div>
              <div>
                <span className={`badge ${instance.online ? "ok" : "warn"}`}>
                  {instance.online ? "在线" : "离线"}
                </span>
              </div>
              <div>{instance.updated_at ? new Date(instance.updated_at).toLocaleString() : "-"}</div>
              <div className="stack">
                <input
                  className="inline-input"
                  value={editing[instance.id] ?? instance.control_ui_url ?? ""}
                  onChange={(event) => handleEdit(instance.id, event.target.value)}
                  placeholder="控制台 URL"
                />
                {instance.control_ui_url ? (
                  <a
                    href={instance.control_ui_url}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    打开控制台
                  </a>
                ) : null}
              </div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => handleSave(instance.id)}>
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetId(instance.id);
                    setModalOpen(true);
                  }}
                >
                  发任务
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? <div className="empty">暂无实例</div> : null}
        </div>
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        instances={instances}
        defaultTargetId={targetId}
        onCreated={(id) => {
          window.location.hash = `#/tasks/${id}`;
        }}
      />
    </section>
  );
}
