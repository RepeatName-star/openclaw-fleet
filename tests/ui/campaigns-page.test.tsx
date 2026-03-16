/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import CampaignsPage from "../../ui/src/pages/Campaigns.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("campaigns page lets operators select an existing group and copy its selector", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/v1/campaigns") {
      return jsonResponse({ items: [] });
    }
    if (url === "/v1/groups") {
      return jsonResponse({
        items: [
          {
            id: "g-1",
            name: "prod-workers",
            selector: "biz.openclaw.io/env=prod,biz.openclaw.io/role=worker",
            description: "prod workers",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
    }
    throw new Error(`unexpected url: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<CampaignsPage />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  const groupSelect = await screen.findByLabelText("Group");
  fireEvent.change(groupSelect, { target: { value: "g-1" } });

  expect((screen.getByLabelText("Selector") as HTMLInputElement).value).toBe(
    "biz.openclaw.io/env=prod,biz.openclaw.io/role=worker",
  );
});

test("campaigns page shows action-specific payload guidance", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/v1/campaigns") {
      return jsonResponse({ items: [] });
    }
    if (url === "/v1/groups") {
      return jsonResponse({ items: [] });
    }
    throw new Error(`unexpected url: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<CampaignsPage />);

  const actionSelect = await screen.findByLabelText("Action");

  fireEvent.change(actionSelect, { target: { value: "session.reset" } });
  expect(await screen.findByText(/session\.reset payload/i)).toBeTruthy();
  expect(screen.getByText(/"key"/)).toBeTruthy();

  fireEvent.change(actionSelect, { target: { value: "agent.run" } });
  expect(await screen.findByText(/agent\.run payload/i)).toBeTruthy();
  expect(screen.getByText(/"message"/)).toBeTruthy();
});
