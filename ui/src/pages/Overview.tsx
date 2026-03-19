import React, { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import type { OverviewStats } from "../types";

export default function OverviewPage() {
  const api = useMemo(() => createApiClient(), []);
  const [stats, setStats] = useState<OverviewStats>({
    instances_total: 0,
    instances_online: 0,
    tasks_total: 0,
    tasks_pending: 0,
    tasks_leased: 0,
    tasks_done: 0,
    tasks_error: 0,
    campaigns_open: 0,
    skill_bundles_total: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setError(null);
        const data = await api.getOverview();
        if (!active) {
          return;
        }
        setStats(data);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>全局概览</h1>
          <p>先看全局水位，再进入实例、任务、技能、分组和批量执行工作流。</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="overview-grid">
        <article className="card metric-card">
          <div className="label">纳管实例</div>
          <div className="metric-value">{stats.instances_total}</div>
          <p className="muted">在线实例 {stats.instances_online}，用于快速判断整体可操作性。</p>
        </article>
        <article className="card metric-card">
          <div className="label">在线实例</div>
          <div className="metric-value">{stats.instances_online}</div>
          <p className="muted">适合先进入“实例”页处理离线、备注名和控制台入口。</p>
        </article>
        <article className="card metric-card">
          <div className="label">任务总数</div>
          <div className="metric-value">{stats.tasks_total}</div>
          <p className="muted">
            pending {stats.tasks_pending} / leased {stats.tasks_leased} / done {stats.tasks_done} / error{" "}
            {stats.tasks_error}
          </p>
        </article>
        <article className="card metric-card">
          <div className="label">开放 Campaign</div>
          <div className="metric-value">{stats.campaigns_open}</div>
          <p className="muted">用于观察批量动作是否仍在 fan-out 或等待 gate 放行。</p>
        </article>
        <article className="card metric-card">
          <div className="label">Skill Bundles</div>
          <div className="metric-value">{stats.skill_bundles_total}</div>
          <p className="muted">控制面当前可分发的 bundle 数量，供安装与回滚使用。</p>
        </article>
      </div>
    </section>
  );
}
