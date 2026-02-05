import crypto from "node:crypto";
import { buildConnectParams } from "../../src/sidecar/gateway-client.js";
import { deriveDeviceIdFromPublicKey } from "../../src/sidecar/device-identity.js";

test("buildConnectParams uses gateway-client/backend defaults", () => {
  const params = buildConnectParams({ token: "t" });
  expect(params.client.id).toBe("gateway-client");
  expect(params.client.mode).toBe("backend");
  expect(params.minProtocol).toBe(3);
  expect(params.maxProtocol).toBe(3);
  expect(params.auth?.token).toBe("t");
});

test("buildConnectParams includes device identity and nonce", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const deviceId = deriveDeviceIdFromPublicKey(publicKeyPem);
  expect(deviceId).toBeTruthy();

  const params = buildConnectParams({
    token: "t",
    nonce: "nonce-1",
    signedAtMs: 123,
    deviceIdentity: {
      deviceId: deviceId as string,
      publicKeyPem,
      privateKeyPem,
    },
  });

  expect(params.device?.id).toBe(deviceId);
  expect(params.device?.nonce).toBe("nonce-1");
  expect(params.device?.signedAt).toBe(123);
  expect(typeof params.device?.signature).toBe("string");
  expect((params.device?.signature ?? "").length).toBeGreaterThan(10);
  expect((params.device?.publicKey ?? "").length).toBeGreaterThan(10);
});
