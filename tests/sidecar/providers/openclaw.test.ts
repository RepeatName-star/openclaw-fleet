import { createOpenClawProvider } from "../../../src/sidecar/providers/openclaw";

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
