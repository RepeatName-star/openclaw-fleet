import type { SidecarProvider, FleetConfigPatchParams } from "./providers/types.js";

function resolveConfigBaseHash(result: unknown): string | undefined {
  const baseHash = (result as Record<string, unknown> | null)?.baseHash;
  if (typeof baseHash === "string" && baseHash.length > 0) {
    return baseHash;
  }
  const hash = (result as Record<string, unknown> | null)?.hash;
  if (typeof hash === "string" && hash.length > 0) {
    return hash;
  }
  return undefined;
}

function isStaleHashError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("config changed since last load; re-run config.get and retry");
}

async function patchWithFreshHash(
  provider: Pick<SidecarProvider, "configGet" | "configPatch">,
  payload: FleetConfigPatchParams,
) {
  const config = await provider.configGet({});
  await provider.configPatch({
    raw: payload.raw,
    baseHash: resolveConfigBaseHash(config),
    note: payload.note,
    sessionKey: payload.sessionKey,
    restartDelayMs: payload.restartDelayMs,
  });
}

export async function applyFleetConfigPatch(
  provider: Pick<SidecarProvider, "configGet" | "configPatch">,
  payload: FleetConfigPatchParams,
) {
  try {
    await patchWithFreshHash(provider, payload);
  } catch (err) {
    if (!isStaleHashError(err)) {
      throw err;
    }
    await patchWithFreshHash(provider, payload);
  }
}
