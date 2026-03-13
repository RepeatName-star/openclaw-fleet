import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSidecarConfig } from "./config.js";
import { createControlPlaneClient } from "./control-plane.js";
import { createExecutor } from "./executor.js";
import { createGatewayClient } from "./gateway-client.js";
import { createScheduler } from "./scheduler.js";
import { createStateStore } from "./state-store.js";
import { createGenericHttpProvider } from "./providers/generic-http.js";
import { createOpenClawProvider } from "./providers/openclaw.js";
import { logError, logInfo } from "./log.js";

export async function startSidecar(env: NodeJS.ProcessEnv = process.env) {
  const config = loadSidecarConfig(env);
  logInfo("sidecar start", {
    controlPlaneUrl: config.controlPlaneUrl,
    provider: config.provider,
    pollIntervalMs: config.pollIntervalMs,
    concurrency: config.concurrency,
  });
  const stateStore = createStateStore(config.statePath);
  const state = await stateStore.load();
  const controlPlane = createControlPlaneClient({ baseUrl: config.controlPlaneUrl });

  let deviceToken = state.deviceToken ?? config.deviceToken;
  if (!deviceToken) {
    const hostname = os.hostname();
    deviceToken = await controlPlane.enroll(config.enrollmentToken ?? "", hostname);
    state.deviceToken = deviceToken;
    await stateStore.save(state);
  }

  let provider;
  if (config.provider === "generic") {
    if (!config.genericProviderUrl) {
      throw new Error("generic provider requires GENERIC_PROVIDER_URL");
    }
    provider = createGenericHttpProvider({ baseUrl: config.genericProviderUrl });
  } else {
    const token =
      config.openclawGatewayToken ??
      readOpenClawGatewayToken() ??
      undefined;
    const gateway = createGatewayClient({
      url: config.openclawGatewayUrl,
      token,
    });
    provider = createOpenClawProvider({ gateway });
  }

  const executor = createExecutor({ provider, state, controlPlane, deviceToken });
  const scheduler = createScheduler({
    controlPlane,
    executor,
    deviceToken,
    pollIntervalMs: config.pollIntervalMs,
    concurrency: config.concurrency,
  });

  scheduler.start();

  return { config, scheduler };
}

function readOpenClawGatewayToken(): string | undefined {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { gateway?: { auth?: { token?: string } } };
    return parsed?.gateway?.auth?.token;
  } catch {
    return undefined;
  }
}

if (process.argv[1] && process.argv[1].includes("cli")) {
  startSidecar().catch((err) => {
    logError("sidecar crashed", { error: String(err) });
    process.exit(1);
  });
}
