import { createExecutor } from "../../src/sidecar/executor.js";

test("executor skips already executed tasks", async () => {
  const state = { executed: { t1: true } } as any;
  const provider = { skillsUpdate: async () => {} } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t1", action: "skills.update", payload: {} }]);
  expect(res.skipped).toBe(1);
});
