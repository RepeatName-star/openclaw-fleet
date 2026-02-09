import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { InstanceSummary } from "../types";

export default function SkillsPage() {
  const api = useMemo(() => createApiClient(), []);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api.listInstances();
        if (!active) return;
        setInstances(data);
        if (!selectedId && data.length) {
          setSelectedId(data[0].id);
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
  }, [api, selectedId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedId) return;
      setLoading(true);
      try {
        const res = await api.getInstanceSkills(selectedId);
        if (!active) return;
        setSnapshot(res.skills);
        setUpdatedAt(res.updated_at ?? null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [api, selectedId]);

  const skillsList = Array.isArray(snapshot?.skills)
    ? snapshot.skills
    : Array.isArray(snapshot)
      ? snapshot
      : [];

  async function triggerStatus() {
    if (!selectedId) return;
    try {
      await api.createTask({
        target_type: "instance",
        target_id: selectedId,
        action: "skills.status",
        payload: {},
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateSkill(skillKey: string, enabled: boolean) {
    if (!selectedId) return;
    try {
      await api.createTask({
        target_type: "instance",
        target_id: selectedId,
        action: "skills.update",
        payload: { skillKey, enabled },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Skills</h1>
          <p>查看与更新实例技能状态。</p>
        </div>
        <button type="button" onClick={triggerStatus}>
          刷新技能状态
        </button>
      </header>

      <div className="filters">
        <select
          className="filters-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">选择实例</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.name}
            </option>
          ))}
        </select>
        <div className="filters-slot">
          {updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString()}` : ""}
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="hint">加载中...</div> : null}

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>Skill</div>
            <div>状态</div>
            <div>来源</div>
            <div>操作</div>
          </div>
          {skillsList.map((skill: any) => (
            <div key={skill.skillKey ?? skill.name} className="table-row">
              <div>{skill.skillKey ?? skill.name}</div>
              <div>
                <span className={`badge ${skill.disabled ? "warn" : "ok"}`}>
                  {skill.disabled ? "禁用" : "启用"}
                </span>
              </div>
              <div className="muted">{skill.source ?? "-"}</div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => updateSkill(skill.skillKey ?? skill.name, true)}>
                  启用
                </button>
                <button type="button" className="ghost" onClick={() => updateSkill(skill.skillKey ?? skill.name, false)}>
                  禁用
                </button>
              </div>
            </div>
          ))}
          {skillsList.length === 0 ? (
            <div className="empty">暂无技能快照，请点击刷新。</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
