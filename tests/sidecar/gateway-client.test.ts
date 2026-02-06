import crypto from "node:crypto";
import { createGatewayClient, buildConnectParams } from "../../src/sidecar/gateway-client.js";
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

class FakeWebSocket {
  private handlers = new Map<string, (arg1?: any, arg2?: any) => void>();
  sent: string[] = [];

  on(event: string, handler: (arg1?: any, arg2?: any) => void) {
    this.handlers.set(event, handler);
  }

  emit(event: string, arg1?: any, arg2?: any) {
    const handler = this.handlers.get(event);
    if (handler) {
      handler(arg1, arg2);
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.emit("close", code ?? 1000, reason ?? "");
  }
}

function emitChallenge(ws: FakeWebSocket, nonce = "n1") {
  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce } }),
    ),
  );
}

function respondToLastRequest(ws: FakeWebSocket, ok = true) {
  const last = ws.sent[ws.sent.length - 1];
  const frame = JSON.parse(last);
  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "res",
        id: frame.id,
        ok,
        payload: ok ? {} : undefined,
        error: ok ? undefined : { message: "nope" },
      }),
    ),
  );
}

test("gateway client rejects request on timeout", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    requestTimeoutMs: 20,
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  await expect(client.request("health")).rejects.toThrow(/timeout/i);
  client.close();
});

test("gateway client rejects pending requests on close", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    requestTimeoutMs: 1000,
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  const pending = client.request("health");
  ws.close(1008, "bye");

  await expect(pending).rejects.toThrow(/gateway closed/i);
  client.close();
});
