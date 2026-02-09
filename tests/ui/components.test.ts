import React from "react";
import { renderToString } from "react-dom/server";
import InstancesPage from "../../ui/src/pages/Instances.js";
import TasksPage from "../../ui/src/pages/Tasks.js";
import TaskDetailPage from "../../ui/src/pages/TaskDetail.js";
import SkillsPage from "../../ui/src/pages/Skills.js";
import MemoryPage from "../../ui/src/pages/Memory.js";

function render(component: React.ReactElement) {
  return renderToString(component);
}

test("instances page renders", () => {
  const html = render(React.createElement(InstancesPage));
  expect(html).toContain("Instances");
});

test("tasks page renders", () => {
  const html = render(React.createElement(TasksPage));
  expect(html).toContain("Tasks");
});

test("task detail page renders", () => {
  const html = render(React.createElement(TaskDetailPage, { taskId: "t1" }));
  expect(html).toContain("Task Detail");
});

test("skills page renders", () => {
  const html = render(React.createElement(SkillsPage));
  expect(html).toContain("Skills");
});

test("memory page renders", () => {
  const html = render(React.createElement(MemoryPage));
  expect(html).toContain("Memory");
});
