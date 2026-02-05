import { buildConnectParams } from "../../src/sidecar/gateway-client.js";

test("buildConnectParams uses gateway-client/backend defaults", () => {
  const params = buildConnectParams({ token: "t" });
  expect(params.client.id).toBe("gateway-client");
  expect(params.client.mode).toBe("backend");
  expect(params.auth?.token).toBe("t");
});
