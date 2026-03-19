/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SkillsPage from "../../ui/src/pages/Skills.js";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("skills page shows skill count and opens integrated install workflow", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === "/v1/instances" && (!init || !init.method)) {
      return jsonResponse({
        items: [
          {
            id: "i-1",
            name: "node-1",
            display_name: "北京控制面",
            updated_at: new Date().toISOString(),
            online: true,
          },
        ],
      });
    }

    if (url === "/v1/instances/i-1/skills" && (!init || !init.method)) {
      return jsonResponse({
        updated_at: new Date().toISOString(),
        skills: {
          skills: [
            { skillKey: "demo-skill", disabled: false, source: "bundle" },
            { skillKey: "ops-skill", disabled: false, source: "local" },
          ],
        },
      });
    }

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

    throw new Error(`unexpected request: ${url} ${init?.method ?? "GET"}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(<SkillsPage />);

  expect(await screen.findByText("2 个 Skill")).toBeTruthy();
  expect(screen.getByText("demo-skill")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "安装 Skill" }));

  expect(await screen.findByText("上传 Skill Bundle")).toBeTruthy();
  expect(screen.getByRole("button", { name: /安装到实例/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /创建安装 Campaign/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /删除 bundle/i })).toBeTruthy();
});
