import { randomUUID } from "node:crypto";
import WebSocket from "ws";

export type GatewayClient = {
  request: (method: string, params?: unknown) => Promise<unknown>;
  close: () => void;
};

type GatewayClientOptions = {
  url: string;
  token?: string;
  clientId?: string;
  clientVersion?: string;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export function createGatewayClient(options: GatewayClientOptions): GatewayClient {
  const clientId = options.clientId ?? "openclaw-fleet-sidecar";
  const clientVersion = options.clientVersion ?? "0.1.0";
  const ws = new WebSocket(options.url);
  const pending = new Map<string, Pending>();
  let readyResolve: (() => void) | null = null;
  let readyReject: ((err: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  ws.on("open", () => {
    const id = randomUUID();
    pending.set(id, {
      resolve: () => readyResolve?.(),
      reject: (err) => readyReject?.(err),
    });
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method: "connect",
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: clientId,
            version: clientVersion,
            platform: process.platform,
            mode: "operator",
          },
          auth: options.token ? { token: options.token } : undefined,
        },
      }),
    );
  });

  ws.on("message", (data) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (parsed?.type === "res" && typeof parsed.id === "string") {
      const handler = pending.get(parsed.id);
      if (!handler) {
        return;
      }
      pending.delete(parsed.id);
      if (parsed.ok) {
        handler.resolve(parsed.payload);
      } else {
        handler.reject(new Error(parsed.error?.message ?? "gateway error"));
      }
    }
  });

  ws.on("error", (err) => {
    readyReject?.(err as Error);
  });

  async function request(method: string, params?: unknown): Promise<unknown> {
    await ready;
    const id = randomUUID();
    const payload = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method,
        params,
      }),
    );
    return payload;
  }

  return {
    request,
    close: () => ws.close(),
  };
}
