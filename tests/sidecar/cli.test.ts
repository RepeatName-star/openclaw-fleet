import { startSidecar } from "../../src/sidecar/cli.js";

test("startSidecar throws when missing config", async () => {
  await expect(startSidecar({} as any)).rejects.toThrow();
});
