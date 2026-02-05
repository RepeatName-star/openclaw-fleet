import { loadSidecarConfig } from "../../src/sidecar/config";

test("loadSidecarConfig requires controlPlaneUrl and enrollmentToken", () => {
  expect(() => loadSidecarConfig({} as NodeJS.ProcessEnv)).toThrow();
});
