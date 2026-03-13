import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export type SidecarConfig = {
  controlPlaneUrl: string;
  enrollmentToken?: string;
  deviceToken?: string;
  provider: "openclaw" | "generic";
  pollIntervalMs: number;
  concurrency: number;
  statePath: string;
  openclawGatewayUrl: string;
  openclawGatewayToken?: string;
  genericProviderUrl?: string;
  configPath: string;
};

type FileConfig = Partial<
  Omit<SidecarConfig, "configPath" | "pollIntervalMs" | "concurrency"> & {
    pollIntervalMs?: number;
    concurrency?: number;
  }
>;

const ConfigSchema = z
  .object({
    controlPlaneUrl: z.string().min(1),
    enrollmentToken: z.string().min(1).optional(),
    deviceToken: z.string().min(1).optional(),
    provider: z.enum(["openclaw", "generic"]).default("openclaw"),
    pollIntervalMs: z.number().int().min(1000).default(5000),
    concurrency: z.number().int().min(1).default(2),
    statePath: z.string().min(1),
    openclawGatewayUrl: z.string().min(1).default("ws://127.0.0.1:18789"),
    openclawGatewayToken: z.string().min(1).optional(),
    genericProviderUrl: z.string().min(1).optional(),
    configPath: z.string().min(1),
  })
  .refine((value) => value.deviceToken || value.enrollmentToken, {
    message: "deviceToken or enrollmentToken required",
  });

function parseOptionalInt(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.floor(value);
}

function readConfigFile(filePath: string): FileConfig {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.trim()) {
    return {};
  }
  const parsed = JSON.parse(raw) as FileConfig;
  return parsed ?? {};
}

export function resolveDefaultConfigPath(env: NodeJS.ProcessEnv): string {
  if (env.SIDECAR_CONFIG && env.SIDECAR_CONFIG.trim()) {
    return env.SIDECAR_CONFIG.trim();
  }
  return path.join(os.homedir(), ".openclaw-fleet", "sidecar.json");
}

export function resolveDefaultStatePath(): string {
  return path.join(os.homedir(), ".openclaw-fleet", "sidecar-state.json");
}

export function loadSidecarConfig(env: NodeJS.ProcessEnv): SidecarConfig {
  const configPath = resolveDefaultConfigPath(env);
  const fileConfig = readConfigFile(configPath);

  const pollIntervalMs =
    parseOptionalInt(env.POLL_INTERVAL_MS) ?? fileConfig.pollIntervalMs ?? 5000;
  const concurrency = parseOptionalInt(env.CONCURRENCY) ?? fileConfig.concurrency ?? 2;

  const merged = {
    controlPlaneUrl: env.CONTROL_PLANE_URL ?? fileConfig.controlPlaneUrl,
    enrollmentToken: env.ENROLLMENT_TOKEN ?? fileConfig.enrollmentToken,
    deviceToken: env.DEVICE_TOKEN ?? fileConfig.deviceToken,
    provider: (env.PROVIDER ?? fileConfig.provider ?? "openclaw").toLowerCase(),
    pollIntervalMs,
    concurrency,
    statePath: env.STATE_PATH ?? fileConfig.statePath ?? resolveDefaultStatePath(),
    openclawGatewayUrl:
      env.OPENCLAW_GATEWAY_URL ??
      fileConfig.openclawGatewayUrl ??
      "ws://127.0.0.1:18789",
    openclawGatewayToken: env.OPENCLAW_GATEWAY_TOKEN ?? fileConfig.openclawGatewayToken,
    genericProviderUrl: env.GENERIC_PROVIDER_URL ?? fileConfig.genericProviderUrl,
    configPath,
  };

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error("invalid sidecar configuration");
  }
  return parsed.data as SidecarConfig;
}
