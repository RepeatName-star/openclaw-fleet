import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";
import Filters from "../components/Filters";
import Pagination from "../components/Pagination";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<{
    instanceId: string;
    field: "display_name" | "control_ui_url";
    value: string;
  } | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);

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

  async function handleSaveEditor() {
    if (!editor) {
      return;
    }
    setSavingEditor(true);
    setError(null);
    try {
      await api.updateInstance(editor.instanceId, {
        [editor.field]: editor.value.trim() || undefined,
      });
      setEditor(null);
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEditor(false);
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
          <span className="muted small">共 {total} 台实例</span>
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
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setEditor({
                      instanceId: instance.id,
                      field: "display_name",
                      value: instance.display_name ?? "",
                    })
                  }
                >
                  修改备注
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setEditor({
                      instanceId: instance.id,
                      field: "control_ui_url",
                      value: instance.control_ui_url ?? "",
                    })
                  }
                >
                  配置控制台
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
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
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

      {editor ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="修改实例信息">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">修改实例信息</div>
                <div className="muted small">
                  {editor.field === "display_name" ? "修改备注名，列表优先按备注展示。" : "配置该实例的控制台入口 URL。"}
                </div>
              </div>
              <button type="button" className="ghost" onClick={() => setEditor(null)}>
                关闭
              </button>
            </header>
            <div className="modal-body">
              <label>
                {editor.field === "display_name" ? "备注名" : "控制台 URL"}
                <input
                  value={editor.value}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, value: event.target.value } : current,
                    )
                  }
                  placeholder={editor.field === "display_name" ? "例如：北京主控" : "https://control.example.com"}
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => void handleSaveEditor()} disabled={savingEditor}>
                  {savingEditor ? "保存中..." : "保存"}
                </button>
                <button type="button" className="ghost" onClick={() => setEditor(null)} disabled={savingEditor}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
