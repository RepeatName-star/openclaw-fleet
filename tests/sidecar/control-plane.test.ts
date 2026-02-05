import { createControlPlaneClient } from "../../src/sidecar/control-plane";

test("enroll returns device token", async () => {
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({ device_token: "d1" }),
  });
  const client = createControlPlaneClient({ baseUrl: "http://cp", fetch: fetchMock as any });
  const token = await client.enroll("e1", "host-1");
  expect(token).toBe("d1");
});
