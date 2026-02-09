import React, { useEffect, useMemo, useState } from "react";
import InstancesPage from "./pages/Instances";
import TasksPage from "./pages/Tasks";
import TaskDetailPage from "./pages/TaskDetail";
import SkillsPage from "./pages/Skills";
import MemoryPage from "./pages/Memory";

const NAV_ITEMS = [
  { key: "instances", label: "Instances" },
  { key: "tasks", label: "Tasks" },
  { key: "skills", label: "Skills" },
  { key: "memory", label: "Memory/Persona" },
];

function getRoute() {
  if (typeof window === "undefined") {
    return "#/instances";
  }
  return window.location.hash || "#/instances";
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [health, setHealth] = useState("checking");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) {
      window.location.hash = "#/instances";
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

  const content = useMemo(() => {
    const clean = route.replace(/^#\/?/, "");
    if (clean.startsWith("tasks/")) {
      const taskId = clean.replace("tasks/", "");
      return <TaskDetailPage taskId={taskId} />;
    }
    switch (clean) {
      case "tasks":
        return <TasksPage />;
      case "skills":
        return <SkillsPage />;
      case "memory":
        return <MemoryPage />;
      case "instances":
      default:
        return <InstancesPage />;
    }
  }, [route]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">OpenClaw</div>
          <div className="tag">Fleet Control</div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              className={route.includes(item.key) ? "nav-link active" : "nav-link"}
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
          <div className="topbar-title">OpenClaw Fleet</div>
          <div className="topbar-meta">全局监控 / 操作面板</div>
        </header>
        <main className="content-body">{content}</main>
      </div>
    </div>
  );
}
