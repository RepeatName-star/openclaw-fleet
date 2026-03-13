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
