import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
  type DeviceIdentity,
} from "./device-identity.js";

const require = createRequire(import.meta.url);
const DEFAULT_PROTOCOL_VERSION = 3;

export type GatewayClient = {
  request: (method: string, params?: unknown) => Promise<unknown>;
  close: () => void;
};

export type GatewayConnectDevice = {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce?: string;
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
  role?: string;
  scopes?: string[];
  device?: GatewayConnectDevice;
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
  role?: string;
  scopes?: string[];
  deviceIdentity?: DeviceIdentity;
};

type BuildConnectOptions = GatewayClientOptions & {
  nonce?: string;
  signedAtMs?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

type DeviceAuthPayloadParams = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
};

function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

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
  const deviceIdentity = options.deviceIdentity ?? loadOrCreateDeviceIdentity();
  let connectNonce: string | null = null;
  let connectSent = false;
  let connectTimer: NodeJS.Timeout | null = null;

  const sendConnect = () => {
    if (connectSent) {
      return;
    }
    connectSent = true;
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    const id = randomUUID();
    pending.set(id, {
      resolve: () => readyResolve?.(),
      reject: (err) => readyReject?.(err),
    });
    const params = buildConnectParams({
      ...options,
      deviceIdentity,
      nonce: connectNonce ?? undefined,
      signedAtMs: Date.now(),
    });
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method: "connect",
        params,
      }),
    );
  };

  const queueConnect = () => {
    connectNonce = null;
    connectSent = false;
    if (connectTimer) {
      clearTimeout(connectTimer);
    }
    connectTimer = setTimeout(() => {
      sendConnect();
    }, 750);
  };

  ws.on("open", () => {
    queueConnect();
  });

  ws.on("message", (data: any) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (parsed?.type === "event" && parsed.event === "connect.challenge") {
      const payload = parsed.payload as { nonce?: unknown } | undefined;
      const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
      if (nonce) {
        connectNonce = nonce;
        sendConnect();
      }
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

export function buildConnectParams(options: BuildConnectOptions): GatewayConnectParams {
  const minProtocol = options.minProtocol ?? DEFAULT_PROTOCOL_VERSION;
  const maxProtocol = options.maxProtocol ?? DEFAULT_PROTOCOL_VERSION;
  const clientId = options.clientId ?? "gateway-client";
  const clientVersion = options.clientVersion ?? "0.1.0";
  const clientMode = options.clientMode ?? "backend";
  const role = options.role ?? "operator";
  const scopes = options.scopes ?? ["operator.admin"];
  const client = {
    id: clientId,
    displayName: options.clientDisplayName,
    version: clientVersion,
    platform: options.platform ?? process.platform,
    mode: clientMode,
    instanceId: options.instanceId,
  };
  const auth = options.token ? { token: options.token } : undefined;
  const signedAtMs = options.signedAtMs ?? Date.now();
  const device = options.deviceIdentity
    ? (() => {
        const payload = buildDeviceAuthPayload({
          deviceId: options.deviceIdentity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: options.token ?? null,
          nonce: options.nonce ?? null,
        });
        const signature = signDevicePayload(options.deviceIdentity.privateKeyPem, payload);
        return {
          id: options.deviceIdentity.deviceId,
          publicKey: publicKeyRawBase64UrlFromPem(options.deviceIdentity.publicKeyPem),
          signature,
          signedAt: signedAtMs,
          nonce: options.nonce ?? undefined,
        };
      })()
    : undefined;
  return {
    minProtocol,
    maxProtocol,
    client,
    auth,
    role,
    scopes,
    device,
  };
}
