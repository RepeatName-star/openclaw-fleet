import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";
import Filters from "../components/Filters";
import TaskModal from "../components/TaskModal";
import { usePolling } from "../hooks/usePolling.js";

export default function InstancesPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  const loadInstances = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listInstancesPage({
        q: query || undefined,
        page,
        page_size: pageSize,
      });
      setInstances(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, page, pageSize, query]);

  useEffect(() => {
    if (modalOpen) {
      return;
    }
    loadInstances();
  }, [loadInstances, modalOpen]);

  usePolling(loadInstances, 5000, !modalOpen);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleEdit(id: string, value: string) {
    setEditing((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSave(id: string) {
    const value = editing[id] ?? "";
    try {
      await api.updateInstance(id, { display_name: value || undefined });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>实例</h1>
          <p>按备注名优先管理实例，Hostname 与 IP 作为辅助识别信息。</p>
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
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="搜索备注名 / Hostname / IP"
        rightSlot={
          <>
            <label className="filters-page-size">
              每页
              <select
                className="filters-select"
                value={pageSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPageSize(next);
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted small">第 {page} / {totalPages} 页</span>
          </>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>备注名</div>
            <div>Hostname</div>
            <div>IP</div>
            <div>状态</div>
            <div>最近更新时间</div>
            <div>操作</div>
          </div>
          {instances.map((instance) => (
            <div key={instance.id} className="table-row">
              <div>
                <div className="strong">{instance.display_name || instance.name}</div>
                <input
                  className="inline-input"
                  value={editing[instance.id] ?? instance.display_name ?? ""}
                  onChange={(event) => handleEdit(instance.id, event.target.value)}
                  placeholder="填写备注名"
                />
                <div className="muted">{instance.id}</div>
              </div>
              <div className="stack">
                <div className="mono">{instance.name}</div>
                {instance.control_ui_url ? (
                  <a
                    href={instance.control_ui_url}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    打开控制台
                  </a>
                ) : (
                  <span className="muted small">未配置控制台</span>
                )}
              </div>
              <div>{instance.last_seen_ip ?? "-"}</div>
              <div>
                <span className={`badge ${instance.online ? "ok" : "warn"}`}>
                  {instance.online ? "在线" : "离线"}
                </span>
              </div>
              <div>{instance.updated_at ? new Date(instance.updated_at).toLocaleString() : "-"}</div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => handleSave(instance.id)}>
                  保存备注
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
          {instances.length === 0 ? <div className="empty">暂无实例</div> : null}
        </div>
        <div className="pager-row">
          <button
            type="button"
            className="ghost"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </button>
          <button
            type="button"
            className="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            下一页
          </button>
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
