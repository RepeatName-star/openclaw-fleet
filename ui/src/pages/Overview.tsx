import React from "react";

export default function OverviewPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>全局概览</h1>
          <p>从运营视角快速进入实例、任务、技能、分组和批量执行工作流。</p>
        </div>
      </header>

      <div className="overview-grid">
        <article className="card metric-card">
          <div className="label">实例巡检</div>
          <div className="metric-value">实例</div>
          <p className="muted">查看实例备注、在线状态和最近活动。</p>
        </article>
        <article className="card metric-card">
          <div className="label">任务处理</div>
          <div className="metric-value">任务与审计</div>
          <p className="muted">追踪任务执行、事件和审计回放。</p>
        </article>
        <article className="card metric-card">
          <div className="label">批量控制</div>
          <div className="metric-value">批量任务</div>
          <p className="muted">按分组或标签批量下发 Campaign。</p>
        </article>
      </div>
    </section>
  );
}
