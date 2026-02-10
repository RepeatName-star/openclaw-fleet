import React, { useEffect, useMemo, useRef, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";

export type TaskModalProps = {
  open: boolean;
  onClose: () => void;
  instances: InstanceSummary[];
  defaultTargetId?: string;
  initialAction?: string;
  onCreated?: (taskId: string) => void;
};

const ACTIONS = [
  "agent.run",
  "session.reset",
  "memory.replace",
  "skills.update",
  "skills.install",
  "skills.status",
] as const;

type ActionType = (typeof ACTIONS)[number];

export default function TaskModal({
  open,
  onClose,
  instances,
  defaultTargetId,
  initialAction,
  onCreated,
}: TaskModalProps) {
  const api = useMemo(() => createApiClient(), []);
  const [action, setAction] = useState<ActionType>(
    (initialAction as ActionType) ?? "agent.run",
  );
  const [targetId, setTargetId] = useState(defaultTargetId ?? "");
  const [message, setMessage] = useState("");
  const [agentId, setAgentId] = useState("main");
  const [sessionKey, setSessionKey] = useState("agent:main:main");
  const [resetKey, setResetKey] = useState("agent:main:main");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryFileName, setMemoryFileName] = useState("MEMORY.md");
  const [skillKey, setSkillKey] = useState("");
  const [skillEnabled, setSkillEnabled] = useState("enable");
  const [skillApiKey, setSkillApiKey] = useState("");
  const [skillEnv, setSkillEnv] = useState("");
  const [installName, setInstallName] = useState("");
  const [installId, setInstallId] = useState("");
  const [installTimeout, setInstallTimeout] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prevOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      prevOpen.current = false;
      return;
    }
    if (prevOpen.current) {
      return;
    }
    prevOpen.current = true;
    setError(null);
    setAction((initialAction as ActionType) ?? "agent.run");
    setTargetId(defaultTargetId ?? instances[0]?.id ?? "");
    setMessage("");
    setMemoryContent("");
    setSkillKey("");
    setSkillApiKey("");
    setSkillEnv("");
    setInstallName("");
    setInstallId("");
    setInstallTimeout("");
  }, [open, defaultTargetId, initialAction, instances]);

  if (!open) {
    return null;
  }

  const targetOptions = instances.map((instance) => (
    <option key={instance.id} value={instance.id}>
      {instance.name}
    </option>
  ));

  function buildEnvMap() {
    const env: Record<string, string> = {};
    skillEnv
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...rest] = line.split("=");
        if (!key) {
          return;
        }
        env[key.trim()] = rest.join("=").trim();
      });
    return env;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!targetId) {
      setError("请选择目标实例");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let payload: Record<string, unknown> = {};
      if (action === "agent.run") {
        payload = { message, agentId, sessionKey };
      } else if (action === "session.reset") {
        payload = { key: resetKey };
      } else if (action === "memory.replace") {
        payload = { agentId, content: memoryContent, fileName: memoryFileName };
      } else if (action === "skills.update") {
        const env = buildEnvMap();
        payload = {
          skillKey,
          enabled: skillEnabled === "enable",
          apiKey: skillApiKey || undefined,
          env: Object.keys(env).length ? env : undefined,
        };
      } else if (action === "skills.install") {
        payload = {
          name: installName,
          installId,
          timeoutMs: installTimeout ? Number(installTimeout) : undefined,
        };
      }

      const res = await api.createTask({
        target_type: "instance",
        target_id: targetId,
        action,
        payload,
      });
      onCreated?.(res.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header className="modal-header">
          <h3>创建任务</h3>
          <button type="button" className="ghost" onClick={onClose}>
            关闭
          </button>
        </header>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label>
            目标实例
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">请选择</option>
              {targetOptions}
            </select>
          </label>
          <label>
            Action
            <select value={action} onChange={(event) => setAction(event.target.value as ActionType)}>
              {ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {action === "agent.run" ? (
            <div className="grid-two">
              <label>
                Message
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
              </label>
              <div className="stack">
                <label>
                  Agent ID
                  <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
                </label>
                <label>
                  Session Key
                  <input
                    value={sessionKey}
                    onChange={(event) => setSessionKey(event.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {action === "session.reset" ? (
            <label>
              Session Key
              <input value={resetKey} onChange={(event) => setResetKey(event.target.value)} />
            </label>
          ) : null}

          {action === "memory.replace" ? (
            <div className="grid-two">
              <label>
                Agent ID
                <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
              </label>
              <label>
                文件名
                <input
                  value={memoryFileName}
                  onChange={(event) => setMemoryFileName(event.target.value)}
                />
              </label>
              <label className="span-two">
                内容
                <textarea
                  value={memoryContent}
                  onChange={(event) => setMemoryContent(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {action === "skills.update" ? (
            <div className="grid-two">
              <label>
                Skill Key
                <input value={skillKey} onChange={(event) => setSkillKey(event.target.value)} />
              </label>
              <label>
                状态
                <select
                  value={skillEnabled}
                  onChange={(event) => setSkillEnabled(event.target.value)}
                >
                  <option value="enable">启用</option>
                  <option value="disable">禁用</option>
                </select>
              </label>
              <label>
                API Key
                <input
                  value={skillApiKey}
                  onChange={(event) => setSkillApiKey(event.target.value)}
                />
              </label>
              <label className="span-two">
                ENV (key=value 每行一条)
                <textarea value={skillEnv} onChange={(event) => setSkillEnv(event.target.value)} />
              </label>
            </div>
          ) : null}

          {action === "skills.install" ? (
            <div className="grid-two">
              <label>
                Skill 名称
                <input value={installName} onChange={(event) => setInstallName(event.target.value)} />
              </label>
              <label>
                Install ID
                <input value={installId} onChange={(event) => setInstallId(event.target.value)} />
              </label>
              <label>
                Timeout (ms)
                <input
                  value={installTimeout}
                  onChange={(event) => setInstallTimeout(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {action === "skills.status" ? (
            <div className="hint">仅触发刷新，无需额外参数。</div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}

          <div className="modal-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "提交中..." : "提交任务"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
