import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type {
  InstanceMailAddress,
  InstanceMailMessageDetail,
  InstanceMailMessageItem,
  InstanceSummary,
  InstanceToolItem,
} from "../types";
import Filters from "../components/Filters";
import Pagination from "../components/Pagination";
import TaskModal from "../components/TaskModal";
import { usePolling } from "../hooks/usePolling.js";

type MailDraft = {
  from_email: string;
  from_name: string;
  to_email: string;
  to_name: string;
  subject: string;
  text: string;
  html: string;
};

function createMailDraft(tool?: InstanceToolItem | null): MailDraft {
  return {
    from_email: tool?.config.default_from_email ?? "",
    from_name: tool?.config.default_from_name ?? "",
    to_email: "",
    to_name: "",
    subject: "",
    text: "",
    html: "",
  };
}

function formatMailAddress(address?: InstanceMailAddress | null) {
  if (!address) {
    return "-";
  }
  const email = address.Address || address.Email || "";
  const name = address.Name || "";
  if (!email) {
    return name || "-";
  }
  return name ? `${name} <${email}>` : email;
}

function formatMailAddresses(addresses?: InstanceMailAddress[] | null) {
  if (!addresses?.length) {
    return "-";
  }
  return addresses.map((address) => formatMailAddress(address)).join(", ");
}

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
  const [toolsTarget, setToolsTarget] = useState<InstanceSummary | null>(null);
  const [tools, setTools] = useState<InstanceToolItem[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [mailQuery, setMailQuery] = useState("");
  const [mailMessages, setMailMessages] = useState<InstanceMailMessageItem[]>([]);
  const [mailTotal, setMailTotal] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [mailDetail, setMailDetail] = useState<InstanceMailMessageDetail | null>(null);
  const [mailDetailLoading, setMailDetailLoading] = useState(false);
  const [mailDetailError, setMailDetailError] = useState<string | null>(null);
  const [mailDraft, setMailDraft] = useState<MailDraft>(() => createMailDraft());
  const [mailSending, setMailSending] = useState(false);
  const [mailSendError, setMailSendError] = useState<string | null>(null);
  const [mailSendSuccessId, setMailSendSuccessId] = useState<string | null>(null);
  const toolsModalOpen = Boolean(toolsTarget);
  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeToolId) ?? null,
    [tools, activeToolId],
  );

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

  function resetToolsState() {
    setTools([]);
    setToolsError(null);
    setToolsLoading(false);
    setActiveToolId(null);
    setMailQuery("");
    setMailMessages([]);
    setMailTotal(0);
    setMailUnread(0);
    setMailLoading(false);
    setMailError(null);
    setMailDetail(null);
    setMailDetailLoading(false);
    setMailDetailError(null);
    setMailDraft(createMailDraft());
    setMailSending(false);
    setMailSendError(null);
    setMailSendSuccessId(null);
  }

  async function loadMailMessages(toolId: string, queryValue = "") {
    if (!toolsTarget) {
      return;
    }
    setMailLoading(true);
    setMailError(null);
    try {
      const data = await api.listInstanceMailMessages(toolsTarget.id, toolId, {
        query: queryValue || undefined,
        start: 0,
        limit: 20,
      });
      setMailMessages(data.messages ?? []);
      setMailTotal(data.total ?? 0);
      setMailUnread(data.unread ?? 0);
    } catch (err) {
      setMailError(err instanceof Error ? err.message : String(err));
      setMailMessages([]);
      setMailTotal(0);
      setMailUnread(0);
    } finally {
      setMailLoading(false);
    }
  }

  function closeToolsModal() {
    setToolsTarget(null);
    resetToolsState();
  }

  async function handleSelectTool(tool: InstanceToolItem) {
    setActiveToolId(tool.id);
    setMailQuery("");
    setMailDetail(null);
    setMailDetailError(null);
    setMailSendError(null);
    setMailSendSuccessId(null);
    setMailDraft(createMailDraft(tool));
    await loadMailMessages(tool.id);
  }

  async function handleOpenMailMessage(messageId: string) {
    if (!toolsTarget || !activeToolId) {
      return;
    }
    setMailDetailLoading(true);
    setMailDetailError(null);
    try {
      const data = await api.getInstanceMailMessage(toolsTarget.id, activeToolId, messageId);
      setMailDetail(data);
    } catch (err) {
      setMailDetailError(err instanceof Error ? err.message : String(err));
      setMailDetail(null);
    } finally {
      setMailDetailLoading(false);
    }
  }

  async function handleSearchMail() {
    if (!activeToolId) {
      return;
    }
    setMailDetail(null);
    setMailDetailError(null);
    await loadMailMessages(activeToolId, mailQuery);
  }

  async function handleSendMail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toolsTarget || !activeToolId) {
      return;
    }
    setMailSending(true);
    setMailSendError(null);
    setMailSendSuccessId(null);
    try {
      const result = await api.sendInstanceMail(toolsTarget.id, activeToolId, mailDraft);
      setMailSendSuccessId(result.ID);
      await loadMailMessages(activeToolId, mailQuery);
    } catch (err) {
      setMailSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailSending(false);
    }
  }

  useEffect(() => {
    if (modalOpen || toolsModalOpen) {
      return;
    }
    loadInstances();
  }, [loadInstances, modalOpen, toolsModalOpen]);

  useEffect(() => {
    if (!toolsTarget) {
      return;
    }
    let cancelled = false;
    resetToolsState();
    setToolsLoading(true);

    void api
      .listInstanceTools(toolsTarget.id)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setTools(items);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setToolsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setToolsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, toolsTarget]);

  usePolling(loadInstances, 5000, !modalOpen && !toolsModalOpen);
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
                <button type="button" className="ghost" onClick={() => setToolsTarget(instance)}>
                  工具
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

      {toolsTarget ? (
        <div className="modal-backdrop">
          <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="实例工具">
            <header className="modal-header">
              <div className="stack" style={{ gap: 6 }}>
                <div className="strong">实例工具</div>
                <div className="muted small">
                  {(toolsTarget.display_name || toolsTarget.name) ?? toolsTarget.id}
                </div>
              </div>
              <button type="button" className="ghost" onClick={closeToolsModal}>
                关闭
              </button>
            </header>
            <div className="modal-body tools-modal-body">
              {toolsError ? <div className="error">{toolsError}</div> : null}

              <div className="tools-toolbar">
                {toolsLoading ? (
                  <span className="muted small">工具加载中...</span>
                ) : tools.length === 0 ? (
                  <span className="muted small">当前实例未绑定工具</span>
                ) : (
                  tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      className={`pill ${tool.id === activeToolId ? "active" : ""}`}
                      onClick={() => void handleSelectTool(tool)}
                    >
                      {tool.name}
                    </button>
                  ))
                )}
              </div>

              {activeTool && activeTool.tool_type === "mail" ? (
                <div className="tools-layout">
                  <form className="card tool-panel stack" onSubmit={(event) => void handleSendMail(event)}>
                    <div>
                      <div className="section-title">发送邮件</div>
                      <div className="muted small">
                        {activeTool.config.username || "-"} · {activeTool.config.base_url || "-"}
                      </div>
                    </div>

                    {mailSendError ? <div className="error">{mailSendError}</div> : null}
                    {mailSendSuccessId ? <div className="success">发送成功：{mailSendSuccessId}</div> : null}

                    <div className="grid-two">
                      <label>
                        发件人邮箱
                        <input
                          value={mailDraft.from_email}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, from_email: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        发件人名称
                        <input
                          value={mailDraft.from_name}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, from_name: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        收件人邮箱
                        <input
                          value={mailDraft.to_email}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, to_email: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        收件人名称
                        <input
                          value={mailDraft.to_name}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, to_name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="span-two">
                        主题
                        <input
                          value={mailDraft.subject}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, subject: event.target.value }))
                          }
                        />
                      </label>
                      <label className="span-two">
                        纯文本正文
                        <textarea
                          value={mailDraft.text}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, text: event.target.value }))
                          }
                        />
                      </label>
                      <label className="span-two">
                        HTML 正文（可选）
                        <textarea
                          value={mailDraft.html}
                          onChange={(event) =>
                            setMailDraft((current) => ({ ...current, html: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="modal-actions">
                      <button type="submit" disabled={mailSending}>
                        {mailSending ? "发送中..." : "发送邮件"}
                      </button>
                    </div>
                  </form>

                  <div className="stack">
                    <div className="card tool-panel stack">
                      <div>
                        <div className="section-title">查询邮件</div>
                        <div className="muted small">发送测试邮件后，可直接在这里检索 Mailpit 收件箱。</div>
                      </div>

                      <div className="tools-search">
                        <input
                          className="grow"
                          placeholder='subject:"hello"'
                          value={mailQuery}
                          onChange={(event) => setMailQuery(event.target.value)}
                        />
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setMailQuery("");
                            if (activeToolId) {
                              void loadMailMessages(activeToolId);
                            }
                          }}
                          disabled={!activeToolId || mailLoading}
                        >
                          最近邮件
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSearchMail()}
                          disabled={!activeToolId || mailLoading}
                        >
                          搜索
                        </button>
                      </div>

                      <div className="muted small">共 {mailTotal} 封，未读 {mailUnread} 封</div>
                      {mailError ? <div className="error">{mailError}</div> : null}
                      {mailLoading ? <div className="muted small">邮件列表加载中...</div> : null}
                      {!mailLoading && mailMessages.length === 0 ? <div className="empty">暂无邮件</div> : null}

                      <div className="mail-message-list">
                        {mailMessages.map((message) => {
                          const subject = message.Subject || message.ID;
                          return (
                            <div key={message.ID} className="mail-message-card">
                              <div className="stack" style={{ gap: 6 }}>
                                <div className="strong">{subject}</div>
                                <div className="muted small">
                                  {formatMailAddress(message.From)} ·{" "}
                                  {message.Created ? new Date(message.Created).toLocaleString() : "-"}
                                </div>
                                <div className="muted small">{message.Snippet || "-"}</div>
                              </div>
                              <button type="button" className="ghost" onClick={() => void handleOpenMailMessage(message.ID)}>
                                查看 {subject}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="card tool-panel stack">
                      <div className="section-title">邮件详情</div>
                      {mailDetailError ? <div className="error">{mailDetailError}</div> : null}
                      {mailDetailLoading ? <div className="muted small">邮件详情加载中...</div> : null}
                      {!mailDetailLoading && !mailDetail ? <div className="empty">选择一封邮件查看详情</div> : null}
                      {mailDetail ? (
                        <div className="detail-scroll stack">
                          <div>
                            <div className="label">主题</div>
                            <div>{mailDetail.Subject || "-"}</div>
                          </div>
                          <div>
                            <div className="label">发件人</div>
                            <div>{formatMailAddress(mailDetail.From)}</div>
                          </div>
                          <div>
                            <div className="label">收件人</div>
                            <div>{formatMailAddresses(mailDetail.To)}</div>
                          </div>
                          <div>
                            <div className="label">时间</div>
                            <div>{mailDetail.Date ? new Date(mailDetail.Date).toLocaleString() : "-"}</div>
                          </div>
                          <div>
                            <div className="label">正文</div>
                            <pre className="code-block">{mailDetail.Text || mailDetail.HTML || ""}</pre>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : toolsLoading ? null : (
                <div className="empty">请选择一个 mail 工具</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
