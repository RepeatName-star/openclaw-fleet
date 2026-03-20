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

    if (url === "/v1/events?task_id=task-1&page=1&page_size=10") {
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 10 });
    }

    throw new Error(`unexpected GET ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<TaskDetailPage taskId="task-1" pollIntervalMs={10} />);

  expect(await screen.findByText("pending")).toBeTruthy();

  await waitFor(() => expect(screen.getByText("done")).toBeTruthy());
  expect(fetchMock.mock.calls.some((call) => call[0] === "/v1/tasks/task-1")).toBe(true);
}, 10000);

test("task detail shows final result summary and task event timeline", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/v1/tasks/task-1") {
      return jsonResponse({
        id: "task-1",
        target_type: "instance",
        target_id: "inst-1",
        action: "agent.run",
        payload: { message: "hello" },
        attempts: 1,
        status: "done",
      });
    }

    if (url === "/v1/tasks/task-1/attempts") {
      return jsonResponse({ items: [{ attempt: 1, status: "ok", error: null, started_at: "2026-03-20T01:00:00.000Z" }] });
    }

    if (url === "/v1/events?task_id=task-1&page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "event-2",
            event_type: "exec.finished",
            ts: "2026-03-20T01:00:02.000Z",
            task_id: "task-1",
            payload: { task_id: "task-1", action: "agent.run", status: "ok" },
            labels_snapshot: {},
            artifact_id: "artifact-1",
          },
          {
            id: "event-1",
            event_type: "exec.started",
            ts: "2026-03-20T01:00:01.000Z",
            task_id: "task-1",
            payload: { task_id: "task-1", action: "agent.run" },
            labels_snapshot: {},
            artifact_id: null,
          },
        ],
        total: 2,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/artifacts/artifact-1") {
      return jsonResponse({
        id: "artifact-1",
        kind: "task.result",
        created_at: "2026-03-20T01:00:02.000Z",
        expires_at: "2026-04-20T01:00:02.000Z",
        content: {
          action: "agent.run",
          status: "ok",
          task_id: "task-1",
          result: {
            result: {
              payloads: [{ text: "今天是星期四。", mediaUrl: null }],
            },
          },
        },
      });
    }

    throw new Error(`unexpected GET ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<TaskDetailPage taskId="task-1" pollIntervalMs={10} />);

  expect(await screen.findByText("最终结果")).toBeTruthy();
  expect(await screen.findByText("今天是星期四。")).toBeTruthy();
  expect(screen.getByText("任务事件")).toBeTruthy();
  expect(screen.getByText("exec.finished")).toBeTruthy();
});
