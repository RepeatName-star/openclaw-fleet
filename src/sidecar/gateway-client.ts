import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type GatewayClient = {
  request: (method: string, params?: unknown) => Promise<unknown>;
  close: () => void;
};

export type GatewayConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: string;
    instanceId?: string;
  };
  auth?: {
    token?: string;
    password?: string;
  };
};

type GatewayClientOptions = {
  url: string;
  token?: string;
  clientId?: string;
  clientVersion?: string;
  clientMode?: string;
  clientDisplayName?: string;
  platform?: string;
  instanceId?: string;
  minProtocol?: number;
  maxProtocol?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export function createGatewayClient(options: GatewayClientOptions): GatewayClient {
  const WebSocket = require("ws") as any;
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
    const params = buildConnectParams(options);
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method: "connect",
        params,
      }),
    );
  });

  ws.on("message", (data: any) => {
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

  ws.on("error", (err: Error) => {
    readyReject?.(err);
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

export function buildConnectParams(options: GatewayClientOptions): GatewayConnectParams {
  const minProtocol = options.minProtocol ?? 1;
  const maxProtocol = options.maxProtocol ?? 1;
  const clientId = options.clientId ?? "gateway-client";
  const clientVersion = options.clientVersion ?? "0.1.0";
  const clientMode = options.clientMode ?? "backend";
  const client = {
    id: clientId,
    displayName: options.clientDisplayName,
    version: clientVersion,
    platform: options.platform ?? process.platform,
    mode: clientMode,
    instanceId: options.instanceId,
  };
  const auth = options.token ? { token: options.token } : undefined;
  return {
    minProtocol,
    maxProtocol,
    client,
    auth,
  };
}
