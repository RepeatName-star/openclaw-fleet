import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";

export default function MemoryPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState<"memory" | "persona">("memory");
  const [agentId, setAgentId] = useState("main");
  const [fileName, setFileName] = useState("MEMORY.md");
  const [content, setContent] = useState("");
  const [patchRaw, setPatchRaw] = useState("");
  const [note, setNote] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [restartDelayMs, setRestartDelayMs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api.listInstances();
        if (!active) return;
        setInstances(data);
        if (!targetId && data.length) {
          setTargetId(data[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [api, targetId]);

  async function handleSubmit() {
    if (!targetId) {
      setError("请选择目标实例");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      if (mode === "memory") {
        await api.createTask({
          target_type: "instance",
          target_id: targetId,
          action: "memory.replace",
          payload: { agentId, content, fileName },
        });
        setSuccess("Memory 已下发");
      } else {
        await api.createTask({
          target_type: "instance",
          target_id: targetId,
          action: "fleet.config_patch",
          payload: {
            raw: patchRaw,
            note: note || undefined,
            sessionKey: sessionKey || undefined,
            restartDelayMs: restartDelayMs ? Number(restartDelayMs) : undefined,
          },
        });
        setSuccess("Persona Patch 已下发");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Memory & Persona</h1>
          <p>更新 Memory 或 Persona 配置。</p>
        </div>
        <button type="button" onClick={handleSubmit}>
          一键下发
        </button>
      </header>

      <div className="filters">
        <select
          className="filters-select"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">选择实例</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.name}
            </option>
          ))}
        </select>
        <div className="filters-slot">
          <button
            type="button"
            className={mode === "memory" ? "pill active" : "pill"}
            onClick={() => setMode("memory")}
          >
            Memory
          </button>
          <button
            type="button"
            className={mode === "persona" ? "pill active" : "pill"}
            onClick={() => setMode("persona")}
          >
            Persona
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      {mode === "memory" ? (
        <div className="card stack">
          <div className="grid-two">
            <label>
              Agent ID
              <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
            </label>
            <label>
              文件名
              <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            </label>
          </div>
          <label>
            内容
            <textarea value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="card stack">
          <label>
            Patch Raw
            <textarea value={patchRaw} onChange={(event) => setPatchRaw(event.target.value)} />
          </label>
          <div className="grid-two">
            <label>
              Note (可选)
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <label>
              Session Key (可选)
              <input value={sessionKey} onChange={(event) => setSessionKey(event.target.value)} />
            </label>
            <label>
              Restart Delay (ms)
              <input
                value={restartDelayMs}
                onChange={(event) => setRestartDelayMs(event.target.value)}
              />
            </label>
          </div>
          <div className="hint">
            Fleet 会先执行 <span className="mono">config.get</span> 并自动带上每台实例自己的
            <span className="mono"> baseHash</span>。
          </div>
        </div>
      )}
    </section>
  );
}
