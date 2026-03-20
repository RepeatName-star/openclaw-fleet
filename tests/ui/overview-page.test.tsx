/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import OverviewPage from "../../ui/src/pages/Overview.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("overview page renders operator summary cards from the overview endpoint", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/v1/overview") {
      return jsonResponse({
        instances_total: 14,
        instances_online: 12,
        tasks_total: 38,
        tasks_pending: 4,
        tasks_leased: 3,
        tasks_done: 28,
        tasks_error: 3,
        campaigns_open: 2,
        skill_bundles_total: 5,
      });
    }

    throw new Error(`unexpected url: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(<OverviewPage />);

  expect(await screen.findByText("纳管实例")).toBeTruthy();
  expect(screen.getByText("14")).toBeTruthy();
  expect(screen.getByText("在线实例")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByText("任务总数")).toBeTruthy();
  expect(screen.getByText("38")).toBeTruthy();
  expect(screen.getByText("开放 Campaign")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("Skill Bundles")).toBeTruthy();
  expect(screen.getByText("5")).toBeTruthy();
});
