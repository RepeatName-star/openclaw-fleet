import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { logError, logWarn } from "./log.js";

const require = createRequire(import.meta.url);
const DEFAULT_PROTOCOL_VERSION = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export type GatewayClient = {
  request: (method: string, params?: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;
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
  requestTimeoutMs?: number;
  wsFactory?: (url: string) => {
    on: (event: string, handler: (arg1?: any, arg2?: any) => void) => void;
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
  };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout | null;
};

export function createGatewayClient(options: GatewayClientOptions): GatewayClient {
  const ws =
    options.wsFactory?.(options.url) ??
    (() => {
      const WebSocket = require("ws") as any;
      return new WebSocket(options.url);
    })();
  const pending = new Map<string, Pending>();
  let readyResolve: (() => void) | null = null;
  let readyReject: ((err: Error) => void) | null = null;
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = () => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      resolve();
    };
    readyReject = (err) => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      reject(err);
    };
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
      if (handler.timer) {
        clearTimeout(handler.timer);
      }
      if (parsed.ok) {
        handler.resolve(parsed.payload);
      } else {
        handler.reject(new Error(parsed.error?.message ?? "gateway error"));
      }
    }
  });

  const rejectAllPending = (err: Error) => {
    for (const [, handler] of pending) {
      if (handler.timer) {
        clearTimeout(handler.timer);
      }
      handler.reject(err);
    }
    pending.clear();
  };

  ws.on("close", (code?: number, reason?: any) => {
    const text = typeof reason === "string" ? reason : reason?.toString?.() ?? "";
    const err = new Error(`gateway closed (${code ?? 1000}): ${text}`);
    if (!readySettled) {
      readyReject?.(err);
    }
    rejectAllPending(err);
    logWarn(err.message);
  });

  ws.on("error", (err: Error) => {
    if (!readySettled) {
      readyReject?.(err);
    }
    rejectAllPending(err instanceof Error ? err : new Error(String(err)));
    logError(`gateway error: ${String(err)}`);
  });

  function request(
    method: string,
    params?: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<unknown> {
    const id = randomUUID();
    const payload = new Promise<unknown>((resolve, reject) => {
      const timeoutMs = opts?.timeoutMs ?? options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      let timer: NodeJS.Timeout | null = null;
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`gateway request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }
      pending.set(id, { resolve, reject, timer });
    });
    ready
      .then(() => {
        if (!pending.has(id)) {
          return;
        }
        try {
          ws.send(
            JSON.stringify({
              type: "req",
              id,
              method,
              params,
            }),
          );
        } catch (err) {
          const handler = pending.get(id);
          if (handler?.timer) {
            clearTimeout(handler.timer);
          }
          pending.delete(id);
          handler?.reject(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .catch((err) => {
        const handler = pending.get(id);
        if (handler?.timer) {
          clearTimeout(handler.timer);
        }
        pending.delete(id);
        handler?.reject(err instanceof Error ? err : new Error(String(err)));
      });
    return payload;
  }

  return {
    request,
    close: () => ws.close(),
  };
}

export function buildConnectParams(options: GatewayClientOptions): GatewayConnectParams {
  const minProtocol = options.minProtocol ?? DEFAULT_PROTOCOL_VERSION;
  const maxProtocol = options.maxProtocol ?? DEFAULT_PROTOCOL_VERSION;
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
