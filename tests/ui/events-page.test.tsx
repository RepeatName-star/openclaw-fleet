/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import EventsPage from "../../ui/src/pages/Events.js";

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

test("events page allows filtering by campaign id outside the active campaign list", async () => {
  const requests: Array<{ url: string; method: string }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });

    if (url === "/v1/campaigns" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "c-live",
            name: "live-campaign",
            selector: "biz.openclaw.io/openclaw=true",
            action: "skills.status",
            generation: 1,
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
            expires_at: null,
          },
        ],
      });
    }

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({ items: [] });
    }

    if (url === "/v1/events?limit=200" && method === "GET") {
      return jsonResponse({ items: [] });
    }

    if (url === "/v1/events?campaign_id=c-deleted&limit=200" && method === "GET") {
      return jsonResponse({ items: [] });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EventsPage />);

  const campaignField = await screen.findByLabelText("Campaign");
  expect(campaignField.tagName).toBe("INPUT");

  fireEvent.change(campaignField, { target: { value: "c-deleted" } });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));

  await waitFor(() =>
    expect(requests).toContainEqual({ url: "/v1/events?campaign_id=c-deleted&limit=200", method: "GET" }),
  );
});
