import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { CampaignItem, GroupItem } from "../types";
import { usePolling } from "../hooks/usePolling.js";

const ACTION_DOCS: Record<
  string,
  {
    example: string;
    note: string;
    fields: Array<{ name: string; description: string }>;
  }
> = {
  "skills.status": {
    example: "{}",
    note: "读取当前实例的 skills 快照；v0.1 常用为空对象。",
    fields: [],
  },
  "fleet.gateway.probe": {
    example: "{}",
    note: "探测 gateway 可达性与 OpenClaw 版本；无需额外参数。",
    fields: [],
  },
  "fleet.config_patch": {
    example: JSON.stringify(
      {
        raw: JSON.stringify(
          {
            models: {
              default: "zai/glm-5-turbo",
            },
          },
          null,
          2,
        ),
        note: "switch default model",
        restartDelayMs: 500,
      },
      null,
      2,
    ),
    note: "自动通过 config.get 获取每台实例当前 hash，再调用原生 config.patch；这是批量改配置的默认入口。",
    fields: [
      { name: "raw", description: "要写入的 JSON/JSON5 配置片段字符串。" },
      { name: "note", description: "可选，变更备注，便于审计和回溯。" },
      { name: "sessionKey", description: "可选，指定要复用的会话 key。" },
      { name: "restartDelayMs", description: "可选，补丁写入后延迟重启的毫秒数。" },
    ],
  },
  "fleet.skill_bundle.install": {
    example: JSON.stringify({ bundleId: "<bundleId>", name: "demo-skill", sha256: "<sha256>" }, null, 2),
    note: "通过控制面分发并安装 tar.gz bundle，name 会作为 ~/.openclaw-fleet/skills 下的目录名。",
    fields: [
      { name: "bundleId", description: "控制面中上传后的 bundle ID。" },
      { name: "name", description: "安装后的技能目录名。" },
      { name: "sha256", description: "bundle 的校验值，用于 sidecar 校验下载内容。" },
    ],
  },
  "skills.update": {
    example: JSON.stringify({ skillKey: "weather", enabled: true, apiKey: "", env: { FOO: "bar" } }, null, 2),
    note: "更新单个 skill 的启用状态、apiKey 或 env；空字符串表示清空对应值。",
    fields: [
      { name: "skillKey", description: "要更新的技能 key。" },
      { name: "enabled", description: "是否启用该技能。" },
      { name: "apiKey", description: "可选，覆盖技能 API Key。" },
      { name: "env", description: "可选，额外注入的环境变量对象。" },
    ],
  },
  "skills.install": {
    example: JSON.stringify({ name: "weather", installId: "<installId>", timeoutMs: 300000 }, null, 2),
    note: "调用 OpenClaw 原生远程技能安装；installId 为上游安装请求 ID。",
    fields: [
      { name: "name", description: "要安装的 skill 名称。" },
      { name: "installId", description: "OpenClaw 上游返回的安装任务 ID。" },
      { name: "timeoutMs", description: "可选，等待安装完成的超时毫秒数。" },
    ],
  },
  "config.patch": {
    example: JSON.stringify(
      {
        raw: JSON.stringify(
          {
            skills: {
              load: {
                extraDirs: ["/path"],
              },
            },
          },
          null,
          2,
        ),
        baseHash: "<config.get.hash>",
        note: "fleet update",
      },
      null,
      2,
    ),
    note: "低层 expert 接口。raw 必须是字符串形式的 JSON/JSON5 片段；当实例已有配置时必须传入 config.get 返回的 hash 作为 baseHash。",
    fields: [
      { name: "raw", description: "要应用的 JSON/JSON5 配置片段字符串。" },
      { name: "baseHash", description: "config.get 返回的当前配置 hash。" },
      { name: "note", description: "可选，变更说明。" },
    ],
  },
  "memory.replace": {
    example: JSON.stringify({ agentId: "main", content: "# New memory", fileName: "MEMORY.md" }, null, 2),
    note: "覆盖指定 agent 的 memory 文件，然后重置该 agent 的会话。",
    fields: [
      { name: "agentId", description: "要修改的 agent ID。" },
      { name: "fileName", description: "要覆盖的文件名，通常是 MEMORY.md。" },
      { name: "content", description: "新的完整文件内容。" },
    ],
  },
  "session.reset": {
    example: JSON.stringify({ key: "agent:main:main" }, null, 2),
    note: "key 必须是 OpenClaw Gateway 识别的 session key；批量执行时只适合所有目标实例都存在同名 session 的场景。",
    fields: [{ name: "key", description: "要重置的 session key。" }],
  },
  "agent.run": {
    example: JSON.stringify(
      { message: "Run diagnostics", agentId: "main", sessionKey: "agent:main:main", timeoutMs: 300000 },
      null,
      2,
    ),
    note: "message 为必填；agentId/sessionKey 不填时由实例自身按默认行为处理。timeoutMs 可选，默认等待最终响应 5 分钟。",
    fields: [
      { name: "message", description: "发送给 agent 的文本。" },
      { name: "agentId", description: "可选，指定 agent ID，默认通常是 main。" },
      { name: "sessionKey", description: "可选，会话 key，用于复用已有会话。" },
      { name: "timeoutMs", description: "可选，等待最终响应的超时毫秒数。" },
    ],
  },
};

export default function CampaignsPage() {
  const api = useMemo(() => createApiClient(), []);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selector, setSelector] = useState("");
  const [action, setAction] = useState("skills.status");
  const [payloadRaw, setPayloadRaw] = useState("{}");
  const [payloadEditorOpen, setPayloadEditorOpen] = useState(false);
  const [payloadEditorRaw, setPayloadEditorRaw] = useState("{}");
  const [gateRaw, setGateRaw] = useState("{}");
  const [rolloutRaw, setRolloutRaw] = useState("{}");
  const [expiresAt, setExpiresAt] = useState("");
  const [editing, setEditing] = useState<
    Record<
      string,
      {
        name: string;
        selector: string;
        action: string;
        payloadRaw: string;
        gateRaw: string;
        rolloutRaw: string;
        expiresAt: string;
      }
    >
  >({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [campaigns, groupItems] = await Promise.all([api.listCampaigns(), api.listGroups()]);
    setItems(campaigns);
    setGroups(groupItems);
  }, [api]);

  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        await load();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [load]);

  usePolling(load, 5000, true);

  const actionDoc = ACTION_DOCS[action] ?? {
    example: "{}",
    note: "当前 action 还没有专门的表单，请按 JSON object 直接填写。",
    fields: [],
  };

  function parseJsonObject(raw: string, label: string): Record<string, unknown> {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`${label} 不是合法 JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} 必须是 JSON object`);
    }
    return parsed as Record<string, unknown>;
  }

  function openPayloadEditor() {
    const trimmed = payloadRaw.trim();
    setPayloadEditorRaw(!trimmed || trimmed === "{}" ? actionDoc.example : payloadRaw);
    setPayloadEditorOpen(true);
  }

  function savePayloadEditor() {
    const payload = parseJsonObject(payloadEditorRaw, "payload");
    setPayloadRaw(JSON.stringify(payload, null, 2));
    setPayloadEditorOpen(false);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !selector.trim() || !action.trim()) {
      setError("name/selector/action 不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = parseJsonObject(payloadRaw, "payload");
      const gate = parseJsonObject(gateRaw, "gate");
      const rollout = parseJsonObject(rolloutRaw, "rollout");
      await api.createCampaign({
        name: name.trim(),
        selector: selector.trim(),
        action: action.trim(),
        payload,
        gate,
        rollout,
        expires_at: expiresAt.trim() || undefined,
      });
      setName("");
      setPayloadRaw("{}");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(c: CampaignItem) {
    setBusy(true);
    setError(null);
    try {
      const detail = await api.getCampaign(c.id);
      setEditing((prev) => ({
        ...prev,
        [c.id]: {
          name: detail.name,
          selector: detail.selector,
          action: detail.action,
          payloadRaw: JSON.stringify(detail.payload ?? {}, null, 2),
          gateRaw: JSON.stringify(detail.gate ?? {}, null, 2),
          rolloutRaw: JSON.stringify(detail.rollout ?? {}, null, 2),
          expiresAt: detail.expires_at ?? "",
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
      const payload = parseJsonObject(draft.payloadRaw, "payload");
      const gate = parseJsonObject(draft.gateRaw, "gate");
      const rollout = parseJsonObject(draft.rolloutRaw, "rollout");
      await api.patchCampaign(id, {
        name: draft.name.trim() || undefined,
        selector: draft.selector.trim() || undefined,
        action: draft.action.trim() || undefined,
        payload,
        gate,
        rollout,
        expires_at: draft.expiresAt.trim() || undefined,
      });
      cancelEdit(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function closeCampaign(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.closeCampaign(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCampaign(id);
      cancelEdit(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyGroupSelector(nextGroupId: string) {
    setGroupId(nextGroupId);
    if (!nextGroupId) {
      return;
    }
    const nextGroup = groups.find((item) => item.id === nextGroupId);
    if (nextGroup) {
      setSelector(nextGroup.selector);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>批量任务</h1>
          <p>按 selector fan-out 执行任务（动态成员，best-effort）。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="card stack">
        <div className="section-title">创建批量任务</div>
        <form className="stack" onSubmit={handleCreate}>
          <div className="grid-two">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Group
              <select value={groupId} onChange={(event) => applyGroupSelector(event.target.value)}>
                <option value="">(manual selector)</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Selector
              <input value={selector} onChange={(event) => setSelector(event.target.value)} />
            </label>
            <label>
              Action
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="skills.status">skills.status</option>
                <option value="fleet.gateway.probe">fleet.gateway.probe</option>
                <option value="fleet.config_patch">fleet.config_patch</option>
                <option value="fleet.skill_bundle.install">fleet.skill_bundle.install</option>
                <option value="skills.update">skills.update</option>
                <option value="skills.install">skills.install</option>
                <option value="config.patch">config.patch</option>
                <option value="memory.replace">memory.replace</option>
                <option value="session.reset">session.reset</option>
                <option value="agent.run">agent.run</option>
              </select>
            </label>
            <label>
              Expires At (ISO, 可选)
              <input
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                placeholder="2026-12-31T00:00:00.000Z"
              />
            </label>
          </div>
          <div className="grid-two">
            <div className="card stack" style={{ background: "transparent", boxShadow: "none", padding: 0 }}>
              <div className="section-title">Payload</div>
              <div className="hint">当前待提交的 Payload JSON，点击弹窗编辑。</div>
              <pre className="code-block">{payloadRaw}</pre>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={openPayloadEditor}>
                  编辑 Payload
                </button>
              </div>
            </div>
            <div className="stack">
              <label>
                Gate (JSON object)
                <textarea value={gateRaw} onChange={(event) => setGateRaw(event.target.value)} />
              </label>
              <label>
                Rollout (JSON object)
                <textarea value={rolloutRaw} onChange={(event) => setRolloutRaw(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={busy}>
              {busy ? "创建中..." : "创建"}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={load}>
              刷新列表
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-title">批量任务列表</div>
        <div className="table">
          <div
            className="table-row header"
            style={{
              gridTemplateColumns:
                "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
            }}
          >
            <div>Name</div>
            <div>Status</div>
            <div>Selector / Action</div>
            <div>Generation</div>
            <div>Actions</div>
          </div>
          {items.map((c) => {
            const draft = editing[c.id];
            const isEditing = Boolean(draft);
            return (
              <div
                key={c.id}
                className="table-row"
                style={{
                  gridTemplateColumns:
                    "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
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
                          [c.id]: { ...prev[c.id], name: event.target.value },
                        }))
                      }
                    />
                  ) : (
                    <div className="strong">{c.name}</div>
                  )}
                  <div className="muted mono small">{c.id}</div>
                </div>
                <div>
                  <span className={`badge ${c.status === "open" ? "ok" : "warn"}`}>{c.status}</span>
                </div>
                <div className="stack">
                  {isEditing ? (
                    <>
                      <input
                        className="inline-input"
                        value={draft!.selector}
                        onChange={(event) =>
                          setEditing((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], selector: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="inline-input"
                        value={draft!.action}
                        onChange={(event) =>
                          setEditing((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], action: event.target.value },
                          }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <div className="mono">{c.selector}</div>
                      <div className="muted mono small">{c.action}</div>
                    </>
                  )}
                </div>
                <div className="mono">{c.generation}</div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      window.location.hash = `#/events?campaign_id=${c.id}`;
                    }}
                  >
                    Events
                  </button>
                  {c.status === "open" ? (
                    <button type="button" className="ghost" disabled={busy} onClick={() => closeCampaign(c.id)}>
                      Close
                    </button>
                  ) : null}
                  {c.status === "closed" ? (
                    <button type="button" className="ghost" disabled={busy} onClick={() => deleteCampaign(c.id)}>
                      删除
                    </button>
                  ) : null}
                  {isEditing ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => saveEdit(c.id)}>
                        保存
                      </button>
                      <button type="button" className="ghost" disabled={busy} onClick={() => cancelEdit(c.id)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ghost" disabled={busy} onClick={() => void startEdit(c)}>
                      编辑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 ? <div className="empty">暂无 Campaign。</div> : null}
        </div>
      </div>

      {Object.keys(editing).length ? (
        <div className="card">
          <div className="section-title">Edit JSON (Payload / Gate / Rollout)</div>
          <div className="hint">保存将触发 `PATCH /v1/campaigns/:id`（action/payload 变化会递增 generation）。</div>
          <div className="stack">
            {Object.entries(editing).map(([id, draft]) => (
              <div key={id} className="card stack" style={{ background: "transparent", boxShadow: "none", padding: 0 }}>
                <div className="muted mono small">{id}</div>
                <div className="grid-two">
                  <label>
                    Payload
                    <textarea
                      value={draft.payloadRaw}
                      onChange={(event) =>
                        setEditing((prev) => ({
                          ...prev,
                          [id]: { ...prev[id], payloadRaw: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <div className="stack">
                    <label>
                      Gate
                      <textarea
                        value={draft.gateRaw}
                        onChange={(event) =>
                          setEditing((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], gateRaw: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Rollout
                      <textarea
                        value={draft.rolloutRaw}
                        onChange={(event) =>
                          setEditing((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], rolloutRaw: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Expires At (ISO)
                      <input
                        value={draft.expiresAt}
                        onChange={(event) =>
                          setEditing((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], expiresAt: event.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {payloadEditorOpen ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="编辑 Payload JSON">
            <header className="modal-header">
              <div>
                <div className="section-title">编辑 Payload JSON</div>
                <div className="hint">按当前 action 的字段说明修改后保存回创建表单。</div>
              </div>
              <button type="button" className="ghost" onClick={() => setPayloadEditorOpen(false)}>
                关闭
              </button>
            </header>
            <div className="modal-body">
              <div className="stack">
                <div className="hint">{actionDoc.note}</div>
                {actionDoc.fields.length ? (
                  <div className="field-help-list">
                    {actionDoc.fields.map((field) => (
                      <div key={field.name} className="field-help-item">
                        <span className="mono">{field.name}：</span>
                        <span>{field.description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hint">当前 action 无额外字段，保持空对象即可。</div>
                )}
                <label>
                  Payload JSON
                  <textarea
                    className="editor-textarea"
                    value={payloadEditorRaw}
                    onChange={(event) => setPayloadEditorRaw(event.target.value)}
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" onClick={savePayloadEditor}>
                    保存 Payload
                  </button>
                  <button type="button" className="ghost" onClick={() => setPayloadEditorOpen(false)}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
