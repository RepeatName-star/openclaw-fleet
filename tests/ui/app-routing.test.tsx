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

  expect(screen.getByText("全局概览")).toBeTruthy();
  expect(screen.getByText("实例")).toBeTruthy();
  expect(screen.getAllByText("任务与审计").length).toBeGreaterThan(0);
  expect(screen.getByText("技能管理")).toBeTruthy();
  expect(screen.getByText("分组与标签")).toBeTruthy();
  expect(screen.getByText("批量任务")).toBeTruthy();
  expect(screen.getByText("文件与记忆")).toBeTruthy();

  unmount();
  globalThis.fetch = originalFetch;
});
