import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import Pagination from "../../ui/src/components/Pagination.js";
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
  expect(html).toContain("实例");
  expect(html).toContain("备注名");
});

test("tasks page renders", () => {
  const html = render(React.createElement(TasksPage));
  expect(html).toContain("任务与审计");
  expect(html).toContain("任务列表");
});

test("task detail page renders", () => {
  const html = render(React.createElement(TaskDetailPage, { taskId: "t1" }));
  expect(html).toContain("Task Detail");
});

test("skills page renders", () => {
  const html = render(React.createElement(SkillsPage));
  expect(html).toContain("技能管理");
  expect(html).toContain("安装 Skill");
});

test("memory page renders", () => {
  const html = render(React.createElement(MemoryPage));
  expect(html).toContain("文件与记忆");
  expect(html).toContain("保存文件");
});

test("labels page renders", () => {
  const html = render(React.createElement(LabelsPage));
  expect(html).toContain("分组与标签");
  expect(html).toContain("实例标签");
});

test("groups page renders", () => {
  const html = render(React.createElement(GroupsPage));
  expect(html).toContain("分组与标签");
  expect(html).toContain("创建分组");
});

test("campaigns page renders", () => {
  const html = render(React.createElement(CampaignsPage));
  expect(html).toContain("Campaigns");
  expect(html).toContain("创建 Campaign");
});

test("events page renders", () => {
  const html = render(React.createElement(EventsPage));
  expect(html).toContain("任务与审计");
  expect(html).toContain("审计事件");
  expect(html).toContain("导出 JSONL");
});

test("skill bundles page renders", () => {
  const html = render(React.createElement(SkillBundlesPage));
  expect(html).toContain("技能管理");
  expect(html).toContain("上传 Skill Bundle");
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

test("pagination component renders page controls and page size choices", () => {
  const html = render(
    React.createElement(Pagination, {
      page: 2,
      totalPages: 5,
      pageSize: 20,
      onPageChange: () => {},
      onPageSizeChange: () => {},
    }),
  );
  const normalized = html.replace(/<!-- -->/g, "");

  expect(normalized).toContain("每页");
  expect(normalized).toContain("20");
  expect(normalized).toContain("第 2 / 5 页");
  expect(normalized).toContain("上一页");
  expect(normalized).toContain("下一页");
});

test("shared surface styles keep ink-colored text on light panels", () => {
  const css = readFileSync("ui/src/styles.css", "utf8");
  expect(css).toMatch(/\.card\s*{[^}]*color:\s*var\(--ink\);/s);
  expect(css).toMatch(/\.table-row\s*{[^}]*color:\s*var\(--ink\);/s);
});
