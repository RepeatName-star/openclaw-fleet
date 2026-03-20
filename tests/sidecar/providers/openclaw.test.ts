import { createOpenClawProvider } from "../../../src/sidecar/providers/openclaw.js";
import { expect, test, vi } from "vitest";

test("openclaw provider maps memory replace", async () => {
  const request = vi.fn(async (method: string) => {
    return {};
  });
  const gateway = {
    request,
  } as any;
  const provider = createOpenClawProvider({ gateway });
  await provider.memoryReplace({ agentId: "main", content: "x" });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("agents.files.set", {
    agentId: "main",
    name: "MEMORY.md",
    content: "x",
  });
});

test("openclaw provider maps agent file list/get/set", async () => {
  const request = vi.fn(async (method: string) => {
    if (method === "agents.files.list") {
      return { files: [{ name: "AGENTS.md", missing: false }] };
    }
    if (method === "agents.files.get") {
      return { file: { name: "AGENTS.md", content: "# agent\n", missing: false } };
    }
    return { ok: true, file: { name: "AGENTS.md", content: "# updated\n", missing: false } };
  });
  const gateway = { request } as any;
  const provider = createOpenClawProvider({ gateway });

  await expect(provider.agentFilesList({ agentId: "main" })).resolves.toEqual({
    files: [{ name: "AGENTS.md", missing: false }],
  });
  await expect(provider.agentFileGet({ agentId: "main", name: "AGENTS.md" })).resolves.toEqual({
    file: { name: "AGENTS.md", content: "# agent\n", missing: false },
  });
  await expect(
    provider.agentFileSet({ agentId: "main", name: "AGENTS.md", content: "# updated\n" }),
  ).resolves.toEqual({
    ok: true,
    file: { name: "AGENTS.md", content: "# updated\n", missing: false },
  });

  expect(request).toHaveBeenNthCalledWith(1, "agents.files.list", { agentId: "main" });
  expect(request).toHaveBeenNthCalledWith(2, "agents.files.get", {
    agentId: "main",
    name: "AGENTS.md",
  });
  expect(request).toHaveBeenNthCalledWith(3, "agents.files.set", {
    agentId: "main",
    name: "AGENTS.md",
    content: "# updated\n",
  });
});

test("openclaw provider supports config.get", async () => {
  const gateway = { request: async () => ({ baseHash: "h1" }) } as any;
  const provider = createOpenClawProvider({ gateway });
  const res = await provider.configGet({});
  expect((res as any).baseHash).toBe("h1");
});

test("openclaw provider returns agent.run payload", async () => {
  const request = vi.fn().mockResolvedValue({
    runId: "run-1",
    status: "ok",
    result: { text: "Today is Monday." },
  });
  const gateway = {
    request,
  } as any;
  const provider = createOpenClawProvider({ gateway });
  const res = await provider.agentRun({ agentId: "main", message: "今天周几？" });
  expect(request).toHaveBeenCalledWith(
    "agent",
    expect.objectContaining({
      message: "今天周几？",
      agentId: "main",
      deliver: false,
    }),
    { expectFinal: true, timeoutMs: 300000 },
  );
  expect(res).toEqual({
    runId: "run-1",
    status: "ok",
    result: { text: "Today is Monday." },
  });
});

test("openclaw provider honors agent.run timeout override", async () => {
  const request = vi.fn().mockResolvedValue({ runId: "run-2", status: "ok" });
  const gateway = { request } as any;
  const provider = createOpenClawProvider({ gateway });

  await provider.agentRun({ agentId: "main", message: "hello", timeoutMs: 600000 });

  expect(request).toHaveBeenCalledWith(
    "agent",
    expect.objectContaining({
      message: "hello",
      agentId: "main",
      deliver: false,
    }),
    { expectFinal: true, timeoutMs: 600000 },
  );
});
