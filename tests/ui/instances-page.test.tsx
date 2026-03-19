/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import InstancesPage from "../../ui/src/pages/Instances.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("instances page prefers display_name and shows hostname/ip with search and pagination controls", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/instances?page=1&page_size=10" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "i-1",
            name: "host-a",
            display_name: "北京主控",
            last_seen_ip: "10.0.0.8",
            updated_at: new Date().toISOString(),
            online: true,
            control_ui_url: "http://control.local",
          },
          {
            id: "i-2",
            name: "worker-host-02",
            display_name: null,
            last_seen_ip: "10.0.0.9",
            updated_at: new Date().toISOString(),
            online: false,
            control_ui_url: null,
          },
        ],
        total: 2,
        page: 1,
        page_size: 10,
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<InstancesPage />);

  expect(await screen.findByText("北京主控")).toBeTruthy();
  expect(screen.getByText("host-a")).toBeTruthy();
  expect(screen.getAllByText("worker-host-02").length).toBeGreaterThan(0);
  expect(screen.getByText("10.0.0.8")).toBeTruthy();
  expect(screen.getByText("10.0.0.9")).toBeTruthy();

  expect(screen.getByPlaceholderText("搜索备注名 / Hostname / IP")).toBeTruthy();
  expect(screen.getByLabelText("每页")).toBeTruthy();
  expect(screen.getByText("第 1 / 1 页")).toBeTruthy();
});
