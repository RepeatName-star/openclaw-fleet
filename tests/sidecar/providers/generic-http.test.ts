import { createGenericHttpProvider } from "../../../src/sidecar/providers/generic-http.js";

test("generic provider calls /skills endpoint", async () => {
  let called = false;
  const fetchMock = async (url: string) => {
    if (url.endsWith("/skills")) {
      called = true;
    }
    return { ok: true, json: async () => ({ ok: true }) } as any;
  };
  const provider = createGenericHttpProvider({ baseUrl: "http://agent", fetch: fetchMock as any });
  await provider.skillsUpdate({ skillKey: "x", enabled: true });
  expect(called).toBe(true);
});

test("generic provider rejects unsupported managed file operations", async () => {
  const provider = createGenericHttpProvider({
    baseUrl: "http://agent",
    fetch: (async () => ({ ok: true, json: async () => ({ ok: true }) })) as any,
  });

  await expect(provider.agentFilesList({ agentId: "main" })).rejects.toThrow(
    "generic provider does not support managed file operations",
  );
});
