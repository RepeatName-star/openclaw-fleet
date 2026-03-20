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
  const openPayloadEditor = () => fireEvent.click(screen.getByRole("button", { name: "编辑 Payload" }));
  const closePayloadEditor = () => fireEvent.click(screen.getByRole("button", { name: "关闭" }));

  fireEvent.change(actionSelect, { target: { value: "session.reset" } });
  openPayloadEditor();
  expect(await screen.findByText(/要重置的 session key/i)).toBeTruthy();
  expect(screen.getByDisplayValue(/"key"/)).toBeTruthy();
  closePayloadEditor();

  fireEvent.change(actionSelect, { target: { value: "agent.run" } });
  openPayloadEditor();
  expect(await screen.findByText(/发送给 agent 的文本/i)).toBeTruthy();
  expect(screen.getByDisplayValue(/"message"/)).toBeTruthy();
  closePayloadEditor();

  fireEvent.change(actionSelect, { target: { value: "fleet.config_patch" } });
  openPayloadEditor();
  expect(await screen.findByText(/自动通过 config\.get 获取每台实例当前 hash/i)).toBeTruthy();
  expect(screen.getByText(/要写入的 JSON\/JSON5 配置片段字符串/i)).toBeTruthy();
  expect(screen.getByDisplayValue(/"raw"/)).toBeTruthy();
});

test("campaign payload modal saves json back into the create form", async () => {
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
    target: { value: "agent.run" },
  });
  fireEvent.click(screen.getByRole("button", { name: "编辑 Payload" }));

  fireEvent.change(screen.getByLabelText("Payload JSON"), {
    target: { value: '{\n  "message": "hello"\n}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存 Payload" }));

  expect(await screen.findByText(/"message": "hello"/)).toBeTruthy();
});

test("campaigns page starts with empty selector instead of invalid prefix fragment", async () => {
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

  const selectorInput = await screen.findByLabelText("Selector");
  expect((selectorInput as HTMLInputElement).value).toBe("");
});

test("campaign edit loads full detail before saving so existing json fields are preserved", async () => {
  let patchBody: Record<string, unknown> | null = null;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/campaigns" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "c-1",
            name: "batch-run",
            selector: "biz.openclaw.io/env=prod",
            action: "agent.run",
            generation: 3,
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
            expires_at: null,
          },
        ],
      });
    }

    if (url === "/v1/groups" && method === "GET") {
      return jsonResponse({ items: [] });
    }

    if (url === "/v1/campaigns/c-1" && method === "GET") {
      return jsonResponse({
        id: "c-1",
        name: "batch-run",
        selector: "biz.openclaw.io/env=prod",
        action: "agent.run",
        payload: { message: "keep me", agentId: "main" },
        gate: { minVersion: "2026.2.26" },
        rollout: { maxParallel: 2 },
        generation: 3,
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        expires_at: null,
      });
    }

    if (url === "/v1/campaigns/c-1" && method === "PATCH") {
      patchBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return jsonResponse({
        id: "c-1",
        name: "batch-run",
        selector: "biz.openclaw.io/env=prod",
        action: "agent.run",
        payload: patchBody.payload ?? {},
        gate: patchBody.gate ?? {},
        rollout: patchBody.rollout ?? {},
        generation: 3,
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        expires_at: null,
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<CampaignsPage />);

  await screen.findByText("batch-run");

  fireEvent.click(screen.getByRole("button", { name: "编辑" }));

  await screen.findByText("Edit JSON (Payload / Gate / Rollout)");
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(fetchMock).toHaveBeenCalledWith("/v1/campaigns/c-1", undefined);
  expect(patchBody).toMatchObject({
    payload: { message: "keep me", agentId: "main" },
    gate: { minVersion: "2026.2.26" },
    rollout: { maxParallel: 2 },
  });
});

test("campaigns page only shows delete for closed campaigns and uses post alias", async () => {
  const requests: Array<{ url: string; method: string }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });

    if (url === "/v1/campaigns" && method === "GET") {
      return jsonResponse({
        items: [
          {
            id: "c-open",
            name: "open-one",
            selector: "biz.openclaw.io/env=prod",
            action: "agent.run",
            generation: 1,
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
            expires_at: null,
          },
          {
            id: "c-closed",
            name: "closed-one",
            selector: "biz.openclaw.io/env=prod",
            action: "agent.run",
            generation: 2,
            status: "closed",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
    }

    if (url === "/v1/groups" && method === "GET") {
      return jsonResponse({ items: [] });
    }

    if (url === "/v1/campaigns/c-closed/delete" && method === "POST") {
      return jsonResponse({ ok: true });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<CampaignsPage />);

  await screen.findByText("closed-one");

  expect(screen.getByText("open-one")).toBeTruthy();
  expect(screen.getByText("closed-one")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "删除" }));

  await waitFor(() =>
    expect(requests).toContainEqual({ url: "/v1/campaigns/c-closed/delete", method: "POST" }),
  );
});

test("campaigns page uses chinese operator wording and avoids duplicated payload examples", async () => {
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

  expect(await screen.findByText("批量任务")).toBeTruthy();
  expect(screen.getByText("创建批量任务")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Action"), {
    target: { value: "agent.run" },
  });
  fireEvent.click(screen.getByRole("button", { name: "编辑 Payload" }));

  expect(screen.queryAllByText(/"message"/)).toHaveLength(1);
  expect(screen.getByText(/发送给 agent 的文本/i)).toBeTruthy();
  expect(screen.getByText(/可选，会话 key/i)).toBeTruthy();
});
