import { createGenericHttpProvider } from "../../../src/sidecar/providers/generic-http";

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
