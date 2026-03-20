import { createExecutor } from "../../src/sidecar/executor.js";

test("executor skips already executed tasks", async () => {
  const state = { executed: { t1: true } } as any;
  const provider = { skillsUpdate: async () => {} } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t1", action: "skills.update", payload: {} }]);
  expect(res.skipped).toBe(1);
});

test("executor records failure details", async () => {
  const state = { executed: {} } as any;
  const provider = {
    sessionReset: async () => {
      throw new Error("boom");
    },
  } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t2", action: "session.reset", payload: {} }]);
  expect(res.failed).toBe(1);
  expect(res.errors?.t2).toMatch(/boom/);
});

test("executor preserves agent.run result for ack", async () => {
  const state = { executed: {} } as any;
  const provider = {
    agentRun: async () => ({
      runId: "run-1",
      status: "ok",
      result: { text: "Today is Monday." },
    }),
  } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t3", action: "agent.run", payload: { message: "今天周几？" } }]);
  expect(res.processed).toBe(1);
  expect(res.results?.t3).toEqual({
    runId: "run-1",
    status: "ok",
    result: { text: "Today is Monday." },
  });
});

test("executor auto-resolves baseHash for fleet.config_patch", async () => {
  const state = { executed: {} } as any;
  const calls: string[] = [];
  const provider = {
    configGet: async () => {
      calls.push("get");
      return { hash: "h1" };
    },
    configPatch: async (params: any) => {
      calls.push(`patch:${params.baseHash}`);
      expect(params).toMatchObject({
        raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
        baseHash: "h1",
        note: "switch model",
        sessionKey: "agent:main:main",
        restartDelayMs: 250,
      });
    },
  } as any;

  const exec = createExecutor({ provider, state });
  const res = await exec.run([
    {
      id: "t4",
      action: "fleet.config_patch",
      payload: {
        raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
        note: "switch model",
        sessionKey: "agent:main:main",
        restartDelayMs: 250,
      },
    },
  ]);

  expect(res.failed).toBe(0);
  expect(res.processed).toBe(1);
  expect(calls).toEqual(["get", "patch:h1"]);
});

test("executor retries fleet.config_patch once on stale hash errors", async () => {
  const state = { executed: {} } as any;
  const calls: string[] = [];
  let patchCalls = 0;
  const provider = {
    configGet: async () => {
      const hash = calls.length === 0 ? "h1" : "h2";
      calls.push(`get:${hash}`);
      return { hash };
    },
    configPatch: async (params: any) => {
      patchCalls += 1;
      calls.push(`patch:${params.baseHash}`);
      if (patchCalls === 1) {
        throw new Error("config changed since last load; re-run config.get and retry");
      }
    },
  } as any;

  const exec = createExecutor({ provider, state });
  const res = await exec.run([
    {
      id: "t5",
      action: "fleet.config_patch",
      payload: {
        raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
      },
    },
  ]);

  expect(res.failed).toBe(0);
  expect(res.processed).toBe(1);
  expect(calls).toEqual(["get:h1", "patch:h1", "get:h2", "patch:h2"]);
});

test("executor dispatches agent file operations", async () => {
  const state = { executed: {} } as any;
  const provider = {
    agentFilesList: async () => ({ files: [{ name: "AGENTS.md", missing: false }] }),
    agentFileGet: async () => ({
      file: { name: "AGENTS.md", missing: false, content: "# agent\n" },
    }),
    agentFileSet: async () => ({
      ok: true,
      file: { name: "AGENTS.md", missing: false, content: "# updated\n" },
    }),
  } as any;

  const exec = createExecutor({ provider, state });
  const res = await exec.run([
    { id: "t-list", action: "agents.files.list", payload: { agentId: "main" } },
    { id: "t-get", action: "agents.files.get", payload: { agentId: "main", name: "AGENTS.md" } },
    {
      id: "t-set",
      action: "agents.files.set",
      payload: { agentId: "main", name: "AGENTS.md", content: "# updated\n" },
    },
  ]);

  expect(res.failed).toBe(0);
  expect(res.processed).toBe(3);
  expect(res.results).toEqual({
    "t-list": { files: [{ name: "AGENTS.md", missing: false }] },
    "t-get": { file: { name: "AGENTS.md", missing: false, content: "# agent\n" } },
    "t-set": { ok: true, file: { name: "AGENTS.md", missing: false, content: "# updated\n" } },
  });
});
