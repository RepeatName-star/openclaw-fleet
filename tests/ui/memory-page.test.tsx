/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, test, vi } from "vitest";
import MemoryPage from "../../ui/src/pages/Memory.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("memory persona mode submits fleet.config_patch without requiring base hash", async () => {
  let createTaskBody: Record<string, unknown> | null = null;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "i-1",
            name: "Instance-1",
            updated_at: new Date().toISOString(),
            online: true,
          },
        ],
      });
    }

    if (url === "/v1/tasks" && method === "POST") {
      createTaskBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return jsonResponse({ ok: true, id: "t-1" });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryPage />);

  await screen.findByText("Memory & Persona");

  fireEvent.click(screen.getByRole("button", { name: "Persona" }));

  expect(screen.queryByLabelText("Base Hash (可选)")).toBeNull();

  fireEvent.change(screen.getByLabelText("Patch Raw"), {
    target: { value: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}" },
  });
  fireEvent.change(screen.getByLabelText("Note (可选)"), {
    target: { value: "switch model" },
  });
  fireEvent.change(screen.getByLabelText("Session Key (可选)"), {
    target: { value: "agent:main:main" },
  });
  fireEvent.change(screen.getByLabelText("Restart Delay (ms)"), {
    target: { value: "500" },
  });

  fireEvent.click(screen.getByRole("button", { name: "一键下发" }));

  await waitFor(() => expect(createTaskBody).not.toBeNull());
  expect(createTaskBody).toMatchObject({
    target_type: "instance",
    target_id: "i-1",
    action: "fleet.config_patch",
    payload: {
      raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
      note: "switch model",
      sessionKey: "agent:main:main",
      restartDelayMs: 500,
    },
  });
});
