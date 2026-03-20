/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

test("operations route shows operator-friendly task list with search and pagination", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url === "/v1/instances") {
      return jsonResponse({
        items: [
          {
            id: "inst-1",
            name: "iZ2ze1f788nwbjasqed9acZ",
            display_name: "北京控制面",
            last_seen_ip: "10.0.0.8",
            updated_at: "2026-03-19T09:00:00.000Z",
            online: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/tasks" || url === "/v1/tasks?page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "task-1",
            task_name: "每日巡检",
            action: "skills.status",
            status: "done",
            attempts: 1,
            updated_at: "2026-03-19T09:00:00.000Z",
            target_type: "instance",
            target_id: "inst-1",
            instance_name: "iZ2ze1f788nwbjasqed9acZ",
            instance_display_name: "北京控制面",
          },
        ],
        total: 12,
        page: 1,
        page_size: 10,
      });
    }

    throw new Error(`unexpected GET ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/operations";

  render(<App />);

  expect(await screen.findByText("每日巡检")).toBeTruthy();
  expect(screen.getByText("北京控制面")).toBeTruthy();
  expect(screen.getAllByText("skills.status").length).toBeGreaterThan(0);
  expect(screen.getByPlaceholderText("搜索任务名称 / 实例 / Action")).toBeTruthy();
  expect(screen.getByLabelText("状态")).toBeTruthy();
  expect(screen.getByText("第 1 / 2 页")).toBeTruthy();
});

test("operations route switches to searchable audit events tab", async () => {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);

    if (url === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url === "/v1/instances") {
      return jsonResponse({
        items: [
          {
            id: "inst-1",
            name: "iZ2ze1f788nwbjasqed9acZ",
            display_name: "北京控制面",
            last_seen_ip: "10.0.0.8",
            updated_at: "2026-03-19T09:00:00.000Z",
            online: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/tasks" || url === "/v1/tasks?page=1&page_size=10") {
      return jsonResponse({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/campaigns?include_deleted=true") {
      return jsonResponse({
        items: [
          {
            id: "camp-1",
            name: "模型切换",
            selector: "biz.openclaw.io/openclaw=true",
            action: "fleet.config_patch",
            generation: 1,
            status: "open",
            created_at: "2026-03-19T09:00:00.000Z",
            updated_at: "2026-03-19T09:00:00.000Z",
            closed_at: null,
            expires_at: null,
          },
        ],
      });
    }

    if (url === "/v1/events?page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "evt-1",
            event_type: "exec.finished",
            ts: "2026-03-19T09:01:00.000Z",
            campaign_id: "camp-1",
            campaign_generation: 1,
            instance_id: "inst-1",
            instance_name: "北京控制面",
            labels_snapshot: { "biz.openclaw.io/openclaw": "true" },
            payload: { action: "skills.status", status: "ok" },
            artifact_id: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    throw new Error(`unexpected GET ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/operations";

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "审计事件" }));

  expect(await screen.findByText("exec.finished")).toBeTruthy();
  expect(screen.getByLabelText("批量任务")).toBeTruthy();
  expect(screen.getByLabelText("实例")).toBeTruthy();
  expect(screen.getByLabelText("事件类型")).toBeTruthy();
  expect(screen.getByText("第 1 / 1 页")).toBeTruthy();

  await waitFor(() =>
    expect(requests).toContain("/v1/events?page=1&page_size=10"),
  );
});

test("operations route can filter down to manual tasks only", async () => {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);

    if (url === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url === "/v1/instances") {
      return jsonResponse({
        items: [
          {
            id: "inst-1",
            name: "iZ2ze1f788nwbjasqed9acZ",
            display_name: "北京控制面",
            last_seen_ip: "10.0.0.8",
            updated_at: "2026-03-19T09:00:00.000Z",
            online: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/tasks?page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "task-1",
            task_name: "每日巡检",
            action: "skills.status",
            status: "done",
            attempts: 1,
            updated_at: "2026-03-19T09:00:00.000Z",
            target_type: "instance",
            target_id: "inst-1",
            task_origin: "manual",
            instance_name: "iZ2ze1f788nwbjasqed9acZ",
            instance_display_name: "北京控制面",
          },
          {
            id: "task-2",
            task_name: "read file AGENTS.md",
            action: "agents.files.get",
            status: "done",
            attempts: 1,
            updated_at: "2026-03-19T09:01:00.000Z",
            target_type: "instance",
            target_id: "inst-1",
            task_origin: "system",
            instance_name: "iZ2ze1f788nwbjasqed9acZ",
            instance_display_name: "北京控制面",
          },
        ],
        total: 2,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/tasks?task_origin=manual&page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "task-1",
            task_name: "每日巡检",
            action: "skills.status",
            status: "done",
            attempts: 1,
            updated_at: "2026-03-19T09:00:00.000Z",
            target_type: "instance",
            target_id: "inst-1",
            task_origin: "manual",
            instance_name: "iZ2ze1f788nwbjasqed9acZ",
            instance_display_name: "北京控制面",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    throw new Error(`unexpected GET ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/operations";

  render(<App />);

  expect(await screen.findByText("每日巡检")).toBeTruthy();
  expect(screen.getByText("read file AGENTS.md")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "仅手动任务" }));

  expect(await screen.findByText("每日巡检")).toBeTruthy();
  expect(screen.queryByText("read file AGENTS.md")).toBeNull();
  await waitFor(() =>
    expect(requests).toContain("/v1/tasks?task_origin=manual&page=1&page_size=10"),
  );
});

test("operations event detail renders dedicated scrollable panes for long json content", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url === "/v1/instances") {
      return jsonResponse({
        items: [
          {
            id: "inst-1",
            name: "iZ2ze1f788nwbjasqed9acZ",
            display_name: "北京控制面",
            last_seen_ip: "10.0.0.8",
            updated_at: "2026-03-19T09:00:00.000Z",
            online: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/tasks?page=1&page_size=10") {
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 10 });
    }

    if (url === "/v1/campaigns?include_deleted=true") {
      return jsonResponse({ items: [] });
    }

    if (url === "/v1/events?page=1&page_size=10") {
      return jsonResponse({
        items: [
          {
            id: "evt-1",
            event_type: "exec.finished",
            ts: "2026-03-19T09:01:00.000Z",
            campaign_id: null,
            campaign_generation: null,
            instance_id: "inst-1",
            instance_name: "北京控制面",
            labels_snapshot: { "biz.openclaw.io/openclaw": "true" },
            payload: { action: "agent.run", summary: "done" },
            artifact_id: "art-1",
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
      });
    }

    if (url === "/v1/artifacts/art-1") {
      return jsonResponse({
        id: "art-1",
        kind: "task.result",
        created_at: "2026-03-19T09:01:01.000Z",
        expires_at: "2026-04-19T09:01:01.000Z",
        content: {
          large: "x".repeat(4000),
        },
      });
    }

    throw new Error(`unexpected GET ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/operations";

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "审计事件" }));
  fireEvent.click(await screen.findByText("exec.finished"));

  const eventPane = await screen.findByLabelText("Event JSON");
  const artifactPane = await screen.findByLabelText("Artifact JSON");
  expect(eventPane.className).toContain("detail-scroll");
  expect(artifactPane.className).toContain("detail-scroll");
});
