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
