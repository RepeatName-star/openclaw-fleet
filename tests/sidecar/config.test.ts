import { loadSidecarConfig } from "../../src/sidecar/config.js";

test("loadSidecarConfig requires controlPlaneUrl and enrollmentToken", () => {
  expect(() => loadSidecarConfig({} as NodeJS.ProcessEnv)).toThrow();
});
