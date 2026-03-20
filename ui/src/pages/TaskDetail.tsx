import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { ArtifactItem, EventItem, TaskAttempt } from "../types";

export type TaskDetailProps = {
  taskId: string;
  pollIntervalMs?: number;
};

function extractAgentRunText(artifact: ArtifactItem | null) {
  if (!artifact || !artifact.content || typeof artifact.content !== "object" || Array.isArray(artifact.content)) {
    return null;
  }
  const content = artifact.content as Record<string, unknown>;
  const result =
    content.result && typeof content.result === "object" && !Array.isArray(content.result)
      ? (content.result as Record<string, unknown>)
      : null;
  const nested =
    result?.result && typeof result.result === "object" && !Array.isArray(result.result)
      ? (result.result as Record<string, unknown>)
      : null;
  const payloads = Array.isArray(nested?.payloads) ? nested.payloads : [];
  for (const item of payloads) {
    if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as any).text === "string") {
      return (item as any).text as string;
    }
  }
  return null;
}

export default function TaskDetailPage({ taskId, pollIntervalMs = 2000 }: TaskDetailProps) {
  const api = useMemo(() => createApiClient(), []);
  const [task, setTask] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<TaskAttempt[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [resultArtifact, setResultArtifact] = useState<ArtifactItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, attemptData, eventPage] = await Promise.all([
        api.getTask(taskId),
        api.getTaskAttempts(taskId),
        api.listEventsPage({ task_id: taskId, page: 1, page_size: 10 }),
      ]);
      const taskEvents = eventPage.items ?? [];
      const latestArtifactId = taskEvents.find((item) => item.artifact_id)?.artifact_id ?? null;
      const latestArtifact = latestArtifactId ? await api.getArtifact(latestArtifactId) : null;
      setTask(taskData);
      setAttempts(attemptData);
      setEvents(taskEvents);
      setResultArtifact(latestArtifact);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, taskId]);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const [taskData, attemptData, eventPage] = await Promise.all([
          api.getTask(taskId),
          api.getTaskAttempts(taskId),
          api.listEventsPage({ task_id: taskId, page: 1, page_size: 10 }),
        ]);
        const taskEvents = eventPage.items ?? [];
        const latestArtifactId = taskEvents.find((item) => item.artifact_id)?.artifact_id ?? null;
        const latestArtifact = latestArtifactId ? await api.getArtifact(latestArtifactId) : null;
        if (!active) return;
        setTask(taskData);
        setAttempts(attemptData);
        setEvents(taskEvents);
        setResultArtifact(latestArtifact);
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

  async function openEventDetail(item: EventItem) {
    setSelectedEvent(item);
    setSelectedArtifact(null);
    if (!item.artifact_id) {
      return;
    }
    setArtifactBusy(true);
    try {
      const artifact = await api.getArtifact(item.artifact_id);
      setSelectedArtifact(artifact);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setArtifactBusy(false);
    }
  }

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

      <div className="card stack">
        <div className="section-title">最终结果</div>
        {resultArtifact ? (
          <>
            {extractAgentRunText(resultArtifact) ? (
              <div className="result-summary">{extractAgentRunText(resultArtifact)}</div>
            ) : null}
            <pre className="code-block detail-scroll">{JSON.stringify(resultArtifact.content, null, 2)}</pre>
          </>
        ) : (
          <div className="hint">当前任务还没有结果 artifact，通常表示仍在执行中或没有返回内容。</div>
        )}
      </div>

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

      <div className="card">
        <div className="section-title">任务事件</div>
        <div className="table">
          <div
            className="table-row header"
            style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 0.8fr)" }}
          >
            <div>时间</div>
            <div>类型</div>
            <div>Payload</div>
            <div>详情</div>
          </div>
          {events.map((event) => (
            <div
              key={event.id}
              className="table-row"
              style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 0.8fr)" }}
            >
              <div className="mono small">{new Date(event.ts).toLocaleString()}</div>
              <div className="mono small">{event.event_type}</div>
              <pre className="code-block timeline-preview">{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => void openEventDetail(event)}>
                  查看
                </button>
              </div>
            </div>
          ))}
          {events.length === 0 ? <div className="empty">暂无关联事件</div> : null}
        </div>
      </div>

      {selectedEvent ? (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">任务事件详情</div>
                <div className="muted mono small">{selectedEvent.id}</div>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSelectedEvent(null);
                  setSelectedArtifact(null);
                }}
              >
                关闭
              </button>
            </header>
            <div className="modal-body">
              <div>
                <div className="label">Event</div>
                <pre className="code-block detail-scroll">{JSON.stringify(selectedEvent, null, 2)}</pre>
              </div>
              {selectedEvent.artifact_id ? (
                <div>
                  <div className="label">Artifact</div>
                  {selectedArtifact ? (
                    <pre className="code-block detail-scroll">{JSON.stringify(selectedArtifact, null, 2)}</pre>
                  ) : (
                    <div className="hint">{artifactBusy ? "加载 artifact 中..." : "无 artifact 内容或加载失败"}</div>
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
