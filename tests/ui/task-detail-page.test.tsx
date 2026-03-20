/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import TaskDetailPage from "../../ui/src/pages/TaskDetail.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("task detail keeps polling until task reaches a terminal state", async () => {
  let taskReads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/v1/tasks/task-1") {
      taskReads += 1;
      return jsonResponse({
        id: "task-1",
        target_type: "instance",
        target_id: "inst-1",
        action: "agent.run",
        payload: { message: "hello" },
        attempts: 1,
        status: taskReads >= 2 ? "done" : "pending",
      });
    }

    if (url === "/v1/tasks/task-1/attempts") {
      return jsonResponse({ items: [] });
    }

    throw new Error(`unexpected GET ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<TaskDetailPage taskId="task-1" pollIntervalMs={10} />);

  expect(await screen.findByText("pending")).toBeTruthy();

  await waitFor(() => expect(screen.getByText("done")).toBeTruthy());
  expect(fetchMock.mock.calls.some((call) => call[0] === "/v1/tasks/task-1")).toBe(true);
}, 10000);
