import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { TaskAttempt } from "../types";

export type TaskDetailProps = {
  taskId: string;
  pollIntervalMs?: number;
};

export default function TaskDetailPage({ taskId, pollIntervalMs = 2000 }: TaskDetailProps) {
  const api = useMemo(() => createApiClient(), []);
  const [task, setTask] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<TaskAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, attemptData] = await Promise.all([
        api.getTask(taskId),
        api.getTaskAttempts(taskId),
      ]);
      setTask(taskData);
      setAttempts(attemptData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, taskId]);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const [taskData, attemptData] = await Promise.all([
          api.getTask(taskId),
          api.getTaskAttempts(taskId),
        ]);
        if (!active) return;
        setTask(taskData);
        setAttempts(attemptData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [api, taskId]);

  useEffect(() => {
    if (task && ["done", "failed"].includes(String(task.status))) {
      return;
    }
    const id = window.setTimeout(() => {
      void load();
    }, pollIntervalMs);
    return () => window.clearTimeout(id);
  }, [load, pollIntervalMs, task]);

  async function handleRetry() {
    if (!task) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await api.createTask({
        target_type: task.target_type,
        target_id: task.target_id,
        action: task.action,
        payload: task.payload ?? {},
      });
      window.location.hash = `#/tasks/${res.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>任务详情</h1>
          <p className="muted mono">{taskId}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => window.history.back()}>
            返回
          </button>
          <button type="button" onClick={handleRetry} disabled={retrying}>
            {retrying ? "重试中..." : "重试"}
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {task ? (
        <div className="card stack">
          <div className="grid-two">
            <div>
              <div className="label">Action</div>
              <div>{task.action}</div>
            </div>
            <div>
              <div className="label">Status</div>
              <span className={`badge ${task.status === "done" ? "ok" : task.status === "failed" ? "error" : "warn"}`}>
                {task.status}
              </span>
            </div>
            <div>
              <div className="label">Target</div>
              <div>{task.target_type}:{task.target_id}</div>
            </div>
            <div>
              <div className="label">Attempts</div>
              <div>{task.attempts}</div>
            </div>
          </div>
          <div>
            <div className="label">Payload</div>
            <pre className="code-block">{JSON.stringify(task.payload ?? {}, null, 2)}</pre>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="section-title">Attempts</div>
        <div className="table">
          <div className="table-row header">
            <div>#</div>
            <div>Status</div>
            <div>Error</div>
            <div>Started</div>
          </div>
          {attempts.map((attempt) => (
            <div key={attempt.attempt} className="table-row">
              <div>{attempt.attempt}</div>
              <div>{attempt.status}</div>
              <div className="mono small">{attempt.error ?? "-"}</div>
              <div>{attempt.started_at ? new Date(attempt.started_at).toLocaleString() : "-"}</div>
            </div>
          ))}
          {attempts.length === 0 ? <div className="empty">暂无执行记录</div> : null}
        </div>
      </div>
    </section>
  );
}
