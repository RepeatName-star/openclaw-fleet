import { createExecutor } from "../../src/sidecar/executor.js";
import { createOpenClawProvider } from "../../src/sidecar/providers/openclaw.js";

test("fleet.gateway.probe returns server version from hello-ok snapshot", async () => {
  const gateway = {
    request: async (_method: string) => {
      return {};
    },
    getHelloOk: () => ({ server: { version: "2026.2.26" } }),
  } as any;
  const provider = createOpenClawProvider({ gateway });
  const exec = createExecutor({ provider, state: { executed: {} } as any });

  const res = await exec.run([{ id: "t1", action: "fleet.gateway.probe", payload: {} } as any]);
  expect(res.failed).toBe(0);
  expect(res.results?.t1).toMatchObject({
    gateway_reachable: true,
    openclaw_version: "2026.2.26",
  });
});

