import { createGatewayClient, buildConnectParams } from "../../src/sidecar/gateway-client.js";

test("buildConnectParams uses gateway-client/backend defaults", () => {
  const params = buildConnectParams({ token: "t" });
  expect(params.client.id).toBe("gateway-client");
  expect(params.client.mode).toBe("backend");
  expect(params.minProtocol).toBe(3);
  expect(params.maxProtocol).toBe(3);
  expect(params.auth?.token).toBe("t");
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
  respondToLastRequest(ws, true);

  const pending = client.request("health");
  ws.close(1008, "bye");

  await expect(pending).rejects.toThrow(/gateway closed/i);
  client.close();
});
