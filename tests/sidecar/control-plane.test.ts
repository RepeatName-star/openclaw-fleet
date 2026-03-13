import { createControlPlaneClient } from "../../src/sidecar/control-plane.js";

test("enroll returns device token", async () => {
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({ device_token: "d1" }),
  });
  const client = createControlPlaneClient({ baseUrl: "http://cp", fetch: fetchMock as any });
  const token = await client.enroll("e1", "host-1");
  expect(token).toBe("d1");
});

test("control plane client downloads skill bundle", async () => {
  const client = createControlPlaneClient({
    baseUrl: "http://x",
    fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }) as any,
  });
  const buf = await client.downloadSkillBundle("t", "b1");
  expect(buf.byteLength).toBe(3);
});
