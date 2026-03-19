import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type {
  ArtifactItem,
  CampaignItem,
  EventItem,
  InstanceSummary,
  PaginatedItems,
  TaskItem,
} from "../types";
import Filters from "../components/Filters";
import TaskModal from "../components/TaskModal";
import { usePolling } from "../hooks/usePolling.js";

type OperationsPageProps = {
  initialTab?: "tasks" | "events";
};

const TASK_ACTIONS = [
  "",
  "agent.run",
  "session.reset",
  "memory.replace",
  "skills.update",
  "skills.install",
  "skills.status",
  "fleet.gateway.probe",
  "fleet.config_patch",
  "fleet.skill_bundle.install",
];

function emptyPage<T>(): PaginatedItems<T> {
  return { items: [], total: 0, page: 1, page_size: 10 };
}

function readHashQuery(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.location.hash || "";
  const idx = raw.indexOf("?");
  if (idx === -1) {
    return {};
  }
  const params = new URLSearchParams(raw.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function taskBadgeStatus(status: string) {
  if (status === "done") {
    return "ok";
  }
  if (status === "failed") {
    return "error";
  }
  return "warn";
}

function primaryInstanceName(instance: InstanceSummary) {
  return instance.display_name || instance.name;
}

function primaryTaskName(task: TaskItem) {
  return task.task_name || task.action;
}

function taskTargetLabel(task: TaskItem) {
  return task.instance_display_name || task.instance_name || `${task.target_type}:${task.target_id.slice(0, 8)}`;
}

export default function OperationsPage({ initialTab = "tasks" }: OperationsPageProps) {
  const api = useMemo(() => createApiClient(), []);
  const [tab, setTab] = useState<"tasks" | "events">(initialTab);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [taskPage, setTaskPage] = useState<PaginatedItems<TaskItem>>(emptyPage<TaskItem>());
  const [taskQuery, setTaskQuery] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [taskAction, setTaskAction] = useState("");
  const [taskPageNumber, setTaskPageNumber] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const [eventPage, setEventPage] = useState<PaginatedItems<EventItem>>(emptyPage<EventItem>());
  const [eventCampaignId, setEventCampaignId] = useState("");
  const [eventInstanceId, setEventInstanceId] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventPageNumber, setEventPageNumber] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(10);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [artifact, setArtifact] = useState<ArtifactItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialTab !== "events") {
      return;
    }
    const params = readHashQuery();
    setEventCampaignId(params.campaign_id ?? "");
    setEventInstanceId(params.instance_id ?? "");
    setEventType(params.event_type ?? "");
  }, [initialTab]);

  const loadInstances = useCallback(async () => {
    const data = await api.listInstances();
    setInstances(data);
  }, [api]);

  const loadCampaigns = useCallback(async () => {
    const data = await api.listCampaigns({ include_deleted: true });
    setCampaigns(data);
  }, [api]);

  const loadTasks = useCallback(async () => {
    const data = await api.listTasksPage({
      q: taskQuery || undefined,
      action: taskAction || undefined,
      status: taskStatus || undefined,
      page: taskPageNumber,
      page_size: taskPageSize,
    });
    setTaskPage(data);
  }, [api, taskAction, taskPageNumber, taskPageSize, taskQuery, taskStatus]);

  const loadEvents = useCallback(async () => {
    const data = await api.listEventsPage({
      campaign_id: eventCampaignId || undefined,
      instance_id: eventInstanceId || undefined,
      event_type: eventType || undefined,
      page: eventPageNumber,
      page_size: eventPageSize,
    });
    setEventPage(data);
  }, [api, eventCampaignId, eventInstanceId, eventPageNumber, eventPageSize, eventType]);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        setError(null);
        await loadInstances();
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
  }, [loadInstances]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (tab !== "events") {
        return;
      }
      try {
        setError(null);
        await loadCampaigns();
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
  }, [loadCampaigns, tab]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (modalOpen) {
        return;
      }
      try {
        setError(null);
        if (tab === "tasks") {
          await loadTasks();
        } else {
          await loadEvents();
        }
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
  }, [loadEvents, loadTasks, modalOpen, tab]);

  usePolling(() => {
    if (modalOpen) {
      return;
    }
    if (tab === "tasks") {
      void loadTasks();
      return;
    }
    void loadEvents();
  }, 5000, true);

  const taskTotalPages = Math.max(1, Math.ceil(taskPage.total / taskPageSize));
  const eventTotalPages = Math.max(1, Math.ceil(eventPage.total / eventPageSize));
  const campaignById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns],
  );

  async function openEventDetail(item: EventItem) {
    setSelectedEvent(item);
    setArtifact(null);
    if (!item.artifact_id) {
      return;
    }
    setArtifactBusy(true);
    try {
      const data = await api.getArtifact(item.artifact_id);
      setArtifact(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setArtifactBusy(false);
    }
  }

  function buildExportUrl(format: "jsonl" | "csv") {
    const params = new URLSearchParams();
    if (eventCampaignId) {
      params.set("campaign_id", eventCampaignId);
    }
    if (eventInstanceId) {
      params.set("instance_id", eventInstanceId);
    }
    if (eventType) {
      params.set("event_type", eventType);
    }
    params.set("format", format);
    const qs = params.toString();
    return `/v1/events/export${qs ? `?${qs}` : ""}`;
  }

  function exportNow(format: "jsonl" | "csv") {
    if (typeof window === "undefined") {
      return;
    }
    window.open(buildExportUrl(format), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>任务与审计</h1>
          <p>以任务视角查看执行状态，在同一处检索审计事件与 Artifact。</p>
        </div>
        {tab === "tasks" ? (
          <button type="button" onClick={() => setModalOpen(true)}>
            创建任务
          </button>
        ) : null}
      </header>

      <div className="row-actions">
        <button
          type="button"
          className={tab === "tasks" ? "pill active" : "pill"}
          onClick={() => setTab("tasks")}
        >
          任务列表
        </button>
        <button
          type="button"
          className={tab === "events" ? "pill active" : "pill"}
          onClick={() => setTab("events")}
        >
          审计事件
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {tab === "tasks" ? (
        <>
          <Filters
            query={taskQuery}
            onQueryChange={(value) => {
              setTaskQuery(value);
              setTaskPageNumber(1);
            }}
            placeholder="搜索任务名称 / 实例 / Action"
            rightSlot={
              <>
                <label className="filters-inline">
                  Action
                  <select
                    className="filters-select"
                    value={taskAction}
                    onChange={(event) => {
                      setTaskAction(event.target.value);
                      setTaskPageNumber(1);
                    }}
                  >
                    <option value="">全部</option>
                    {TASK_ACTIONS.filter(Boolean).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filters-inline">
                  状态
                  <select
                    className="filters-select"
                    value={taskStatus}
                    onChange={(event) => {
                      setTaskStatus(event.target.value);
                      setTaskPageNumber(1);
                    }}
                  >
                    <option value="">全部</option>
                    <option value="pending">pending</option>
                    <option value="leased">leased</option>
                    <option value="done">done</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
                <label className="filters-page-size">
                  每页
                  <select
                    className="filters-select"
                    value={taskPageSize}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setTaskPageSize(next);
                      setTaskPageNumber(1);
                    }}
                  >
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted small">第 {taskPageNumber} / {taskTotalPages} 页</span>
              </>
            }
          />

          <div className="card">
            <div className="table">
              <div className="table-row header">
                <div>任务名称</div>
                <div>Action</div>
                <div>实例</div>
                <div>状态</div>
                <div>尝试次数</div>
                <div>更新时间</div>
              </div>
              {taskPage.items.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="table-row clickable"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.hash = `#/tasks/${task.id}`;
                    }
                  }}
                >
                  <div className="stack">
                    <div className="strong">{primaryTaskName(task)}</div>
                    <div className="muted mono small">{task.id.slice(0, 8)}</div>
                  </div>
                  <div className="mono small">{task.action}</div>
                  <div className="stack">
                    <div>{taskTargetLabel(task)}</div>
                    <div className="muted mono small">
                      {task.instance_name ?? task.target_id.slice(0, 8)}
                    </div>
                  </div>
                  <div>
                    <span className={`badge ${taskBadgeStatus(task.status)}`}>{task.status}</span>
                  </div>
                  <div>{task.attempts}</div>
                  <div>{task.updated_at ? new Date(task.updated_at).toLocaleString() : "-"}</div>
                </button>
              ))}
              {taskPage.items.length === 0 ? <div className="empty">暂无任务</div> : null}
            </div>
            <div className="pager-row">
              <button
                type="button"
                className="ghost"
                disabled={taskPageNumber <= 1}
                onClick={() => setTaskPageNumber((current) => Math.max(1, current - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="ghost"
                disabled={taskPageNumber >= taskTotalPages}
                onClick={() =>
                  setTaskPageNumber((current) => Math.min(taskTotalPages, current + 1))
                }
              >
                下一页
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card stack">
            <div className="filters filters-wrap">
              <label className="filters-inline grow">
                批量任务
                <select
                  value={eventCampaignId}
                  onChange={(event) => {
                    setEventCampaignId(event.target.value);
                    setEventPageNumber(1);
                  }}
                >
                  <option value="">全部</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                      {campaign.status === "deleted" ? " [deleted]" : ""}
                      {` (${campaign.id.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filters-inline grow">
                实例
                <select
                  value={eventInstanceId}
                  onChange={(event) => {
                    setEventInstanceId(event.target.value);
                    setEventPageNumber(1);
                  }}
                >
                  <option value="">全部</option>
                  {instances.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {primaryInstanceName(instance)} ({instance.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="filters-inline grow">
                事件类型
                <input
                  value={eventType}
                  onChange={(event) => {
                    setEventType(event.target.value);
                    setEventPageNumber(1);
                  }}
                  placeholder="exec.finished"
                />
              </label>
              <label className="filters-page-size">
                每页
                <select
                  className="filters-select"
                  value={eventPageSize}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setEventPageSize(next);
                    setEventPageNumber(1);
                  }}
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span className="muted small">第 {eventPageNumber} / {eventTotalPages} 页</span>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => void loadEvents()}>
                查询
              </button>
              <button type="button" className="ghost" onClick={() => exportNow("jsonl")}>
                导出 JSONL
              </button>
              <button type="button" className="ghost" onClick={() => exportNow("csv")}>
                导出 CSV
              </button>
            </div>
          </div>

          <div className="card">
            <div className="table">
              <div
                className="table-row header"
                style={{
                  gridTemplateColumns:
                    "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.6fr) minmax(0, 1fr)",
                }}
              >
                <div>时间</div>
                <div>事件类型</div>
                <div>实例</div>
                <div>批量任务</div>
                <div>Artifact</div>
              </div>
              {eventPage.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="table-row clickable"
                  style={{
                    gridTemplateColumns:
                      "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.6fr) minmax(0, 1fr)",
                    textAlign: "left",
                  }}
                  onClick={() => void openEventDetail(item)}
                >
                  <div className="mono small">{new Date(item.ts).toLocaleString()}</div>
                  <div className="mono small">{item.event_type}</div>
                  <div className="stack">
                    <div>{item.instance_name ?? "-"}</div>
                    <div className="muted mono small">{item.instance_id?.slice(0, 8) ?? "-"}</div>
                  </div>
                  <div className="stack">
                    <div>
                      {item.campaign_id
                        ? campaignById.get(item.campaign_id)?.name ?? item.campaign_id
                        : "-"}
                    </div>
                    <div className="muted mono small">
                      {item.campaign_id ? item.campaign_id.slice(0, 8) : "-"}
                    </div>
                  </div>
                  <div className="mono small">{item.artifact_id ? item.artifact_id.slice(0, 8) : "-"}</div>
                </button>
              ))}
              {eventPage.items.length === 0 ? <div className="empty">暂无事件</div> : null}
            </div>
            <div className="pager-row">
              <button
                type="button"
                className="ghost"
                disabled={eventPageNumber <= 1}
                onClick={() => setEventPageNumber((current) => Math.max(1, current - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="ghost"
                disabled={eventPageNumber >= eventTotalPages}
                onClick={() =>
                  setEventPageNumber((current) => Math.min(eventTotalPages, current + 1))
                }
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        instances={instances}
        onCreated={(id) => {
          if (typeof window !== "undefined") {
            window.location.hash = `#/tasks/${id}`;
          }
        }}
      />

      {selectedEvent ? (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">事件详情</div>
                <div className="muted mono small">{selectedEvent.id}</div>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSelectedEvent(null);
                  setArtifact(null);
                }}
              >
                关闭
              </button>
            </header>
            <div className="modal-body">
              <div className="grid-two">
                <div>
                  <div className="label">时间</div>
                  <div className="mono small">{new Date(selectedEvent.ts).toLocaleString()}</div>
                </div>
                <div>
                  <div className="label">事件类型</div>
                  <div className="mono small">{selectedEvent.event_type}</div>
                </div>
                <div>
                  <div className="label">实例</div>
                  <div className="mono small">{selectedEvent.instance_name ?? "-"}</div>
                </div>
                <div>
                  <div className="label">批量任务</div>
                  <div className="mono small">{selectedEvent.campaign_id ?? "-"}</div>
                </div>
              </div>
              <div>
                <div className="label">Event</div>
                <pre className="code-block">{JSON.stringify(selectedEvent, null, 2)}</pre>
              </div>
              {selectedEvent.artifact_id ? (
                <div>
                  <div className="label">Artifact</div>
                  {artifact ? (
                    <pre className="code-block">{JSON.stringify(artifact, null, 2)}</pre>
                  ) : (
                    <div className="hint">
                      {artifactBusy ? "加载 artifact 中..." : "无 artifact 内容或加载失败"}
                    </div>
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
