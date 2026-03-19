import React from "react";
import { renderToString } from "react-dom/server";
import InstancesPage from "../../ui/src/pages/Instances.js";
import TasksPage from "../../ui/src/pages/Tasks.js";
import TaskDetailPage from "../../ui/src/pages/TaskDetail.js";
import SkillsPage from "../../ui/src/pages/Skills.js";
import MemoryPage from "../../ui/src/pages/Memory.js";
import LabelsPage from "../../ui/src/pages/Labels.js";
import GroupsPage from "../../ui/src/pages/Groups.js";
import CampaignsPage from "../../ui/src/pages/Campaigns.js";
import EventsPage from "../../ui/src/pages/Events.js";
import SkillBundlesPage from "../../ui/src/pages/SkillBundles.js";
import App from "../../ui/src/App.js";

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

test("labels page renders", () => {
  const html = render(React.createElement(LabelsPage));
  expect(html).toContain("Labels");
  expect(html).toContain("选择实例");
});

test("groups page renders", () => {
  const html = render(React.createElement(GroupsPage));
  expect(html).toContain("Groups");
  expect(html).toContain("创建分组");
});

test("campaigns page renders", () => {
  const html = render(React.createElement(CampaignsPage));
  expect(html).toContain("Campaigns");
  expect(html).toContain("创建 Campaign");
});

test("events page renders", () => {
  const html = render(React.createElement(EventsPage));
  expect(html).toContain("Events");
  expect(html).toContain("导出 JSONL");
});

test("skill bundles page renders", () => {
  const html = render(React.createElement(SkillBundlesPage));
  expect(html).toContain("Skill Bundles");
  expect(html).toContain("上传 Bundle");
});

test("app renders chinese operator navigation", () => {
  const html = render(React.createElement(App));
  expect(html).toContain("全局概览");
  expect(html).toContain("实例");
  expect(html).toContain("任务与审计");
  expect(html).toContain("技能管理");
  expect(html).toContain("分组与标签");
  expect(html).toContain("批量任务");
  expect(html).toContain("文件与记忆");
});
