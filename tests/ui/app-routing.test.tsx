/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import App from "../../ui/src/App.js";

test("App routes with hash query string", () => {
  const originalFetch = globalThis.fetch;
  // Prevent App's health check from scheduling state updates during this test.
  (globalThis as any).fetch = () => new Promise(() => {});

  window.location.hash = "#/events?campaign_id=c1";
  const { unmount } = render(<App />);
  expect(screen.getByText("导出 JSONL")).toBeTruthy();

  unmount();
  globalThis.fetch = originalFetch;
});

test("App shows operator-oriented chinese navigation", () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = () => new Promise(() => {});

  window.location.hash = "#/operations";
  const { unmount } = render(<App />);

  expect(screen.getAllByText("全局概览").length).toBeGreaterThan(0);
  expect(screen.getAllByText("实例").length).toBeGreaterThan(0);
  expect(screen.getAllByText("任务与审计").length).toBeGreaterThan(0);
  expect(screen.getAllByText("技能管理").length).toBeGreaterThan(0);
  expect(screen.getAllByText("分组与标签").length).toBeGreaterThan(0);
  expect(screen.getAllByText("批量任务").length).toBeGreaterThan(0);
  expect(screen.getAllByText("文件与记忆").length).toBeGreaterThan(0);

  unmount();
  globalThis.fetch = originalFetch;
});
