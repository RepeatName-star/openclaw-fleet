import { loadSidecarConfig } from "../../src/sidecar/config.js";

test("loadSidecarConfig requires controlPlaneUrl and enrollmentToken", () => {
  expect(() => loadSidecarConfig({} as NodeJS.ProcessEnv)).toThrow();
});

test("loadSidecarConfig defaults openclawGatewayUrl to ws://127.0.0.1:18789", () => {
  const cfg = loadSidecarConfig({
    CONTROL_PLANE_URL: "http://127.0.0.1:3000",
    ENROLLMENT_TOKEN: "change-me",
    STATE_PATH: "/tmp/openclaw-fleet-sidecar-state.json",
  } as NodeJS.ProcessEnv);
  expect(cfg.openclawGatewayUrl).toBe("ws://127.0.0.1:18789");
});
