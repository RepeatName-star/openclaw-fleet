import crypto from "node:crypto";
import { expect, test, vi } from "vitest";
import { buildConnectParams, createGatewayClient } from "../../src/sidecar/gateway-client.js";
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

test("gateway client rejects with raw error payload", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  const pending = client.request("health");
  await Promise.resolve();
  const last = ws.sent[ws.sent.length - 1];
  const frame = JSON.parse(last);
  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "res",
        id: frame.id,
        ok: false,
        error: { message: "nope", code: "E_TEST", detail: { hint: "x" } },
      }),
    ),
  );

  await expect(pending).rejects.toThrow(
    /\{\"message\":\"nope\",\"code\":\"E_TEST\",\"detail\":\{\"hint\":\"x\"\}\}/,
  );
  client.close();
});

test("gateway client waits for final response when expectFinal is enabled", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  const pending = client.request(
    "agent",
    { message: "今天周几？" },
    { expectFinal: true },
  );
  await Promise.resolve();
  const last = ws.sent[ws.sent.length - 1];
  const frame = JSON.parse(last);

  let settled = false;
  pending.then(() => {
    settled = true;
  });

  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "res",
        id: frame.id,
        ok: true,
        payload: { runId: "run-1", status: "accepted", acceptedAt: 1 },
      }),
    ),
  );
  await Promise.resolve();
  expect(settled).toBe(false);

  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "res",
        id: frame.id,
        ok: true,
        payload: {
          runId: "run-1",
          status: "ok",
          result: { payloads: [{ text: "今天周日。" }] },
        },
      }),
    ),
  );

  await expect(pending).resolves.toEqual({
    runId: "run-1",
    status: "ok",
    result: { payloads: [{ text: "今天周日。" }] },
  });
  client.close();
});

test("gateway client reconnects after close", async () => {
  vi.useFakeTimers();
  const sockets: FakeWebSocket[] = [];
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    reconnectDelayMs: 10,
    wsFactory: () => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      return ws as any;
    },
  });

  sockets[0].emit("open");
  emitChallenge(sockets[0]);
  respondToLastRequest(sockets[0], true);

  sockets[0].close(1012, "service restart");
  await vi.advanceTimersByTimeAsync(10);

  expect(sockets.length).toBe(2);
  sockets[1].emit("open");
  emitChallenge(sockets[1]);
  respondToLastRequest(sockets[1], true);

  const pending = client.request("health");
  await Promise.resolve();
  const last = sockets[1].sent[sockets[1].sent.length - 1];
  expect(JSON.parse(last).method).toBe("health");
  respondToLastRequest(sockets[1], true);
  await expect(pending).resolves.toBeTruthy();

  vi.useRealTimers();
  client.close();
});

test("gateway client stops reconnecting on auth failure", async () => {
  vi.useFakeTimers();
  const sockets: FakeWebSocket[] = [];
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    reconnectDelayMs: 10,
    requestTimeoutMs: 5,
    wsFactory: () => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      return ws as any;
    },
  });

  sockets[0].emit("open");
  emitChallenge(sockets[0]);
  respondToLastRequest(sockets[0], true);
  sockets[0].close(1008, "unauthorized: gateway token mismatch");

  await vi.advanceTimersByTimeAsync(50);
  expect(sockets.length).toBe(1);

  await expect(client.request("health")).rejects.toThrow(/unauthorized/i);

  vi.useRealTimers();
  client.close();
});
