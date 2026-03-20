import React, { useEffect, useMemo, useState } from "react";
import OverviewPage from "./pages/Overview";
import InstancesPage from "./pages/Instances";
import TasksPage from "./pages/Tasks";
import TaskDetailPage from "./pages/TaskDetail";
import SkillsPage from "./pages/Skills";
import MemoryPage from "./pages/Memory";
import LabelsPage from "./pages/Labels";
import GroupsPage from "./pages/Groups";
import CampaignsPage from "./pages/Campaigns";
import EventsPage from "./pages/Events";
import SkillBundlesPage from "./pages/SkillBundles";

const NAV_ITEMS = [
  { key: "overview", label: "全局概览" },
  { key: "instances", label: "实例" },
  { key: "operations", label: "任务与审计" },
  { key: "skills", label: "技能管理" },
  { key: "targeting", label: "分组与标签" },
  { key: "campaigns", label: "批量任务" },
  { key: "memory", label: "文件与记忆" },
];

function getRoute() {
  if (typeof window === "undefined") {
    return "#/overview";
  }
  return window.location.hash || "#/overview";
}

function getPath(route: string) {
  const clean = route.replace(/^#\/?/, "");
  return clean.split("?")[0] ?? clean;
}

function isNavActive(key: string, path: string) {
  if (key === "operations") {
    return path === "operations" || path === "tasks" || path === "events" || path.startsWith("tasks/");
  }
  if (key === "targeting") {
    return path === "targeting" || path === "groups" || path === "labels";
  }
  if (key === "skills") {
    return path === "skills" || path === "bundles";
  }
  return path === key;
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [health, setHealth] = useState("checking");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) {
      window.location.hash = "#/overview";
    }
    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const res = await fetch("/health");
        if (!active) return;
        setHealth(res.ok ? "ok" : "down");
      } catch {
        if (!active) return;
        setHealth("down");
      }
    }
    checkHealth();
    const timer = setInterval(checkHealth, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const path = useMemo(() => getPath(route), [route]);
  const activeNav = useMemo(
    () => NAV_ITEMS.find((item) => isNavActive(item.key, path)) ?? NAV_ITEMS[0],
    [path],
  );

  const content = useMemo(() => {
    if (path.startsWith("tasks/")) {
      const taskId = path.replace("tasks/", "");
      return <TaskDetailPage taskId={taskId} />;
    }
    switch (path) {
      case "overview":
        return <OverviewPage />;
      case "operations":
      case "tasks":
        return <TasksPage />;
      case "skills":
        return <SkillsPage />;
      case "memory":
        return <MemoryPage />;
      case "labels":
        return <LabelsPage />;
      case "targeting":
      case "groups":
        return <GroupsPage />;
      case "campaigns":
        return <CampaignsPage />;
      case "events":
        return <EventsPage />;
      case "bundles":
        return <SkillBundlesPage />;
      case "instances":
      default:
        return <InstancesPage />;
    }
  }, [path]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">OpenClaw Fleet</div>
          <div className="tag">Ops Console</div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              className={isNavActive(item.key, path) ? "nav-link active" : "nav-link"}
              href={`#/${item.key}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="status">
            <span className={`dot ${health === "ok" ? "ok" : "warn"}`} />
            Control Plane: {health}
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="topbar-title">{activeNav.label}</div>
          <div className="topbar-meta">OpenClaw Fleet / 运营控制台</div>
        </header>
        <main className="content-body">{content}</main>
      </div>
    </div>
  );
}
