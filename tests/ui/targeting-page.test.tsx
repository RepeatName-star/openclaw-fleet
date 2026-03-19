/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "../../ui/src/App.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

test("targeting route combines groups, labels, and match preview", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url === "/v1/groups" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "g-1",
            name: "prod-workers",
            selector: "biz.openclaw.io/env=prod",
            description: "prod workers",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
    }

    if (url === "/v1/groups/g-1/matches" && method === "GET") {
      return jsonResponse({
        items: [{ id: "i-1", name: "北京控制面" }],
      });
    }

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "i-1",
            name: "node-1",
            display_name: "北京控制面",
            updated_at: new Date().toISOString(),
            online: true,
          },
        ],
      });
    }

    if (url === "/v1/instances/i-1/labels" && method === "GET") {
      return jsonResponse({
        items: [
          {
            key: "biz.openclaw.io/openclaw",
            value: "true",
            source: "business",
            updated_at: new Date().toISOString(),
          },
        ],
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/targeting";

  render(<App />);

  expect(await screen.findByText("prod-workers")).toBeTruthy();
  expect(await screen.findByText("实例标签")).toBeTruthy();
  expect(screen.getByText("biz.openclaw.io/openclaw")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Matches" }));

  expect(await screen.findByText("匹配预览")).toBeTruthy();
  expect(screen.getAllByText("北京控制面").length).toBeGreaterThan(0);
});
