/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  await screen.findByLabelText("实例");
  expect(await screen.findByRole("button", { name: "AGENTS.md" })).toBeTruthy();
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
