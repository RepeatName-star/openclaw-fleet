/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

test("campaign payload editor modal seeds example json and help for the selected action", async () => {
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

  fireEvent.change(await screen.findByLabelText("Action"), {
    target: { value: "fleet.config_patch" },
  });
  fireEvent.click(screen.getByRole("button", { name: "编辑 Payload" }));

  expect(await screen.findByText("编辑 Payload JSON")).toBeTruthy();
  expect(screen.getByText(/fleet\.config_patch payload/i)).toBeTruthy();
  expect(screen.getByText(/自动通过 config\.get 获取每台实例当前 hash/i)).toBeTruthy();
  expect((screen.getByLabelText("Payload JSON") as HTMLTextAreaElement).value).toContain("\"raw\"");
});
