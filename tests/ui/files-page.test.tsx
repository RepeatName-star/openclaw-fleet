/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import MemoryPage from "../../ui/src/pages/Memory.js";

const APPROVED_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
];

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("file editor shows approved files and loads selected content", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          { id: "i-1", name: "host-1", display_name: "北京主控", updated_at: new Date().toISOString(), online: true },
        ],
      });
    }

    if (url === "/v1/instances/i-1/files" && method === "GET") {
      return jsonResponse({
        items: APPROVED_FILES.map((name) => ({
          name,
          missing: name !== "AGENTS.md",
        })),
      });
    }

    if (url === "/v1/instances/i-1/files/AGENTS.md" && method === "GET") {
      return jsonResponse({
        name: "AGENTS.md",
        missing: false,
        content: "# agent policy\n",
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryPage />);

  await waitFor(() => expect(screen.queryByText("文件列表加载中...")).toBeNull(), { timeout: 3000 });
  expect(await screen.findByRole("button", { name: "AGENTS.md" }, { timeout: 3000 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "MEMORY.md" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "AGENTS.md" }));
  const editor = (await screen.findByLabelText("文件内容")) as HTMLTextAreaElement;
  await waitFor(() => expect(editor.value).toBe("# agent policy\n"));
});

test("file editor saves content and still supports switching instances", async () => {
  let saveRequest: { url: string; method: string; body: Record<string, unknown> } | null = null;
  const requests: Array<{ url: string; method: string }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          { id: "i-1", name: "host-1", display_name: "北京主控", updated_at: new Date().toISOString(), online: true },
          { id: "i-2", name: "host-2", display_name: "上海执行", updated_at: new Date().toISOString(), online: true },
        ],
      });
    }

    if (url === "/v1/instances/i-1/files" && method === "GET") {
      return jsonResponse({
        items: APPROVED_FILES.map((name) => ({
          name,
          missing: name !== "TOOLS.md",
        })),
      });
    }

    if (url === "/v1/instances/i-2/files" && method === "GET") {
      return jsonResponse({
        items: APPROVED_FILES.map((name) => ({
          name,
          missing: true,
        })),
      });
    }

    if (url === "/v1/instances/i-1/files/TOOLS.md" && method === "GET") {
      return jsonResponse({
        name: "TOOLS.md",
        missing: false,
        content: "# tools\n",
      });
    }

    if (url === "/v1/instances/i-1/files/TOOLS.md" && method === "PUT") {
      saveRequest = {
        url,
        method,
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      };
      return jsonResponse({
        ok: true,
        file: {
          name: "TOOLS.md",
          missing: false,
          content: "# tools updated\n",
        },
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryPage />);

  await screen.findByRole("button", { name: "TOOLS.md" });
  fireEvent.click(screen.getByRole("button", { name: "TOOLS.md" }));

  const editor = (await screen.findByLabelText("文件内容")) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "# tools updated\n" } });
  fireEvent.click(screen.getByRole("button", { name: "保存文件" }));

  await waitFor(() =>
    expect(saveRequest).toEqual({
      url: "/v1/instances/i-1/files/TOOLS.md",
      method: "PUT",
      body: { content: "# tools updated\n" },
    }),
  );

  fireEvent.change(screen.getByLabelText("实例"), { target: { value: "i-2" } });

  await waitFor(() =>
    expect(requests).toContainEqual({ url: "/v1/instances/i-2/files", method: "GET" }),
  );
});

test("file editor uses operator workspace layout with dedicated navigator and wide editor", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          { id: "i-1", name: "host-1", display_name: "北京主控", updated_at: new Date().toISOString(), online: true },
        ],
      });
    }

    if (url === "/v1/instances/i-1/files" && method === "GET") {
      return jsonResponse({
        items: APPROVED_FILES.map((name) => ({
          name,
          missing: name !== "AGENTS.md",
        })),
      });
    }

    if (url === "/v1/instances/i-1/files/AGENTS.md" && method === "GET") {
      return jsonResponse({
        name: "AGENTS.md",
        missing: false,
        content: "# agent policy\n",
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryPage />);

  expect(await screen.findByTestId("files-layout")).toBeTruthy();
  expect(screen.getByTestId("files-sidebar").className).toContain("files-sidebar");
  expect(screen.getByTestId("files-editor").className).toContain("files-editor");
  expect(screen.getByLabelText("文件内容").className).toContain("editor-textarea");
});

test("file editor keeps cached content, exposes refresh/save actions, and clears stale content on instance switch", async () => {
  let i2ToolsResolver: ((value: Response) => void) | null = null;
  let i1ToolsReads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/v1/instances" && method === "GET") {
      return jsonResponse({
        items: [
          { id: "i-1", name: "host-1", display_name: "北京主控", updated_at: new Date().toISOString(), online: true },
          { id: "i-2", name: "host-2", display_name: "上海执行", updated_at: new Date().toISOString(), online: true },
        ],
      });
    }

    if (url === "/v1/instances/i-1/files" && method === "GET") {
      return jsonResponse({
        items: [{ name: "TOOLS.md", missing: false }],
      });
    }

    if (url === "/v1/instances/i-2/files" && method === "GET") {
      return jsonResponse({
        items: [{ name: "TOOLS.md", missing: false }],
      });
    }

    if (url === "/v1/instances/i-1/files/TOOLS.md" && method === "GET") {
      i1ToolsReads += 1;
      return jsonResponse({
        name: "TOOLS.md",
        missing: false,
        content: i1ToolsReads >= 2 ? "# tools refreshed\n" : "# tools cached\n",
      });
    }

    if (url === "/v1/instances/i-2/files/TOOLS.md" && method === "GET") {
      return await new Promise<Response>((resolve) => {
        i2ToolsResolver = resolve;
      });
    }

    if (url === "/v1/instances/i-1/files/TOOLS.md" && method === "PUT") {
      return jsonResponse({
        ok: true,
        file: {
          name: "TOOLS.md",
          missing: false,
          content: "# tools saved\n",
        },
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryPage />);

  const editor = (await screen.findByLabelText("文件内容")) as HTMLTextAreaElement;
  await waitFor(() => expect(editor.value).toBe("# tools cached\n"));

  const editorPanel = screen.getByTestId("files-editor");
  expect(within(editorPanel).getByRole("button", { name: "刷新" })).toBeTruthy();
  expect(within(editorPanel).getByRole("button", { name: "保存文件" })).toBeTruthy();

  fireEvent.change(screen.getByLabelText("实例"), { target: { value: "i-2" } });
  expect((screen.getByLabelText("文件内容") as HTMLTextAreaElement).value).toBe("");
  await waitFor(() => expect(i2ToolsResolver).not.toBeNull());

  i2ToolsResolver?.(
    jsonResponse({
      name: "TOOLS.md",
      missing: false,
      content: "# tools from i2\n",
    }) as Response,
  );
  await waitFor(() => expect((screen.getByLabelText("文件内容") as HTMLTextAreaElement).value).toBe("# tools from i2\n"));

  fireEvent.change(screen.getByLabelText("实例"), { target: { value: "i-1" } });
  await waitFor(() => expect((screen.getByLabelText("文件内容") as HTMLTextAreaElement).value).toBe("# tools cached\n"));
  expect(screen.getByText("当前为缓存内容，可点击刷新获取最新版本")).toBeTruthy();
  expect(screen.getByText(/上次加载时间/)).toBeTruthy();
  expect(i1ToolsReads).toBe(1);

  fireEvent.click(within(editorPanel).getByRole("button", { name: "刷新" }));
  await waitFor(() => expect((screen.getByLabelText("文件内容") as HTMLTextAreaElement).value).toBe("# tools refreshed\n"));
  expect(i1ToolsReads).toBe(2);
});
