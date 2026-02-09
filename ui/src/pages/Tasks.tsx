import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary, TaskItem } from "../types";
import Filters from "../components/Filters";
import TaskModal from "../components/TaskModal";

export default function TasksPage() {
  const api = useMemo(() => createApiClient(), []);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const filters: Record<string, string> = {};
        if (statusFilter) {
          filters.status = statusFilter;
        }
        const data = await api.listTasks(filters);
        if (!active) return;
        setTasks(data);
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
  }, [api, statusFilter]);

  useEffect(() => {
    let active = true;
    async function loadInstances() {
      try {
        const data = await api.listInstances();
        if (!active) return;
        setInstances(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    loadInstances();
    return () => {
      active = false;
    };
  }, [api]);

  const filtered = tasks.filter((task) => {
    const value = `${task.id} ${task.action} ${task.status}`.toLowerCase();
    return value.includes(query.toLowerCase());
  });

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Tasks</h1>
          <p>查看任务状态与失败原因。</p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          创建任务
        </button>
      </header>

      <Filters
        query={query}
        onQueryChange={setQuery}
        placeholder="搜索任务 ID/Action/状态"
        rightSlot={
          <select
            className="filters-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="pending">pending</option>
            <option value="leased">leased</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
          </select>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>ID</div>
            <div>Action</div>
            <div>Target</div>
            <div>Status</div>
            <div>Attempts</div>
            <div>更新时间</div>
          </div>
          {filtered.map((task) => (
            <button
              key={task.id}
              type="button"
              className="table-row clickable"
              onClick={() => {
                window.location.hash = `#/tasks/${task.id}`;
              }}
            >
              <div className="mono">{task.id.slice(0, 8)}</div>
              <div>{task.action}</div>
              <div className="muted">{task.target_type}:{task.target_id.slice(0, 8)}</div>
              <div>
                <span className={`badge ${task.status === "done" ? "ok" : task.status === "failed" ? "error" : "warn"}`}>
                  {task.status}
                </span>
              </div>
              <div>{task.attempts}</div>
              <div>{task.updated_at ? new Date(task.updated_at).toLocaleString() : "-"}</div>
            </button>
          ))}
          {filtered.length === 0 ? <div className="empty">暂无任务</div> : null}
        </div>
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        instances={instances}
        onCreated={(id) => {
          window.location.hash = `#/tasks/${id}`;
        }}
      />
    </section>
  );
}
