/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SkillBundlesPage from "../../ui/src/pages/SkillBundles.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("skill bundles page can delete a bundle from the UI", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/v1/skill-bundles" && (!init || !init.method)) {
      return jsonResponse({
        items: [
          {
            id: "b-1",
            name: "demo-skill",
            format: "tar.gz",
            created_at: new Date().toISOString(),
            sha256: "a".repeat(64),
            size_bytes: 123,
          },
        ],
      });
    }
    if (url === "/v1/instances") {
      return jsonResponse({
        items: [
          {
            id: "i-1",
            name: "node-1",
            updated_at: new Date().toISOString(),
            online: true,
          },
        ],
      });
    }
    if (url === "/v1/instances/i-1/skills") {
      return jsonResponse({
        updated_at: new Date().toISOString(),
        skills: { skills: [] },
      });
    }
    if (url === "/v1/skill-bundles/b-1/delete" && init?.method === "POST") {
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected request: ${url} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<SkillBundlesPage />);

  expect(await screen.findByText("demo-skill")).toBeTruthy();

  fireEvent.click(await screen.findByRole("button", { name: /删除 bundle/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/v1/skill-bundles/b-1/delete", expect.objectContaining({ method: "POST" }));
  });
});
