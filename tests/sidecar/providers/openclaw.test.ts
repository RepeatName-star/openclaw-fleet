import { createOpenClawProvider } from "../../../src/sidecar/providers/openclaw.js";

test("openclaw provider maps memory replace", async () => {
  const calls: Array<{ method: string }> = [];
  const gateway = {
    request: async (method: string) => {
      calls.push({ method });
      return {};
    },
  } as any;
  const provider = createOpenClawProvider({ gateway });
  await provider.memoryReplace({ agentId: "main", content: "x" });
  expect(calls.map((c) => c.method)).toEqual(["agents.files.set", "sessions.reset"]);
});

test("openclaw provider supports config.get", async () => {
  const gateway = { request: async () => ({ baseHash: "h1" }) } as any;
  const provider = createOpenClawProvider({ gateway });
  const res = await provider.configGet({});
  expect((res as any).baseHash).toBe("h1");
});

test("openclaw provider returns agent.run payload", async () => {
  const gateway = {
    request: async () => ({
      runId: "run-1",
      status: "ok",
      result: { text: "Today is Monday." },
    }),
  } as any;
  const provider = createOpenClawProvider({ gateway });
  const res = await provider.agentRun({ agentId: "main", message: "今天周几？" });
  expect(res).toEqual({
    runId: "run-1",
    status: "ok",
    result: { text: "Today is Monday." },
  });
});
