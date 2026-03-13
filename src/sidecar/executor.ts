import os from "node:os";
import path from "node:path";
import type {
  ConfigGetParams,
  ConfigPatchParams,
  GatewayProbeParams,
  MemoryReplaceParams,
  SessionResetParams,
  SidecarProvider,
  SkillsInstallParams,
  SkillsUpdateParams,
  SkillsStatusParams,
  AgentRunParams,
} from "./providers/types.js";
import { installSkillBundle } from "./skill-bundles/install.js";

type Task = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
};

type ExecutorState = {
  executed: Record<string, boolean>;
};

type ExecutorResult = {
  processed: number;
  skipped: number;
  failed: number;
  errors: Record<string, string>;
  results: Record<string, unknown>;
};

type ExecutorOptions = {
  provider: SidecarProvider;
  state: ExecutorState;
  controlPlane?: {
    downloadSkillBundle: (deviceToken: string, bundleId: string) => Promise<ArrayBuffer>;
  };
  deviceToken?: string;
  skillsDir?: string;
};

export function createExecutor(options: ExecutorOptions) {
  const { provider, state, controlPlane, deviceToken } = options;
  const skillsDir =
    options.skillsDir ?? path.join(os.homedir(), ".openclaw-fleet", "skills");

  async function dispatch(task: Task) {
    switch (task.action) {
      case "fleet.gateway.probe":
        return provider.gatewayProbe(task.payload as GatewayProbeParams);
      case "fleet.skill_bundle.install": {
        if (!controlPlane || !deviceToken) {
          throw new Error("skill bundle install requires controlPlane and deviceToken");
        }
        const bundleId = String(task.payload?.bundleId ?? "");
        const bundleName = String(task.payload?.name ?? "");
        const sha256 = String(task.payload?.sha256 ?? "");
        if (!bundleId || !bundleName || !sha256) {
          throw new Error("invalid payload");
        }
        await installSkillBundle({
          download: () => controlPlane.downloadSkillBundle(deviceToken, bundleId),
          expectedSha256: sha256,
          bundleName,
          skillsRootDir: skillsDir,
          configGet: () => provider.configGet({}),
          configPatch: (raw, baseHash) =>
            provider.configPatch({
              raw,
              baseHash,
              note: `fleet.skill_bundle.install:${bundleId}`,
            }),
        });
        return;
      }
      case "config.get":
        return provider.configGet(task.payload as ConfigGetParams);
      case "config.patch":
        return provider.configPatch(task.payload as ConfigPatchParams);
      case "skills.install":
        return provider.skillsInstall(task.payload as SkillsInstallParams);
      case "skills.update":
        return provider.skillsUpdate(task.payload as SkillsUpdateParams);
      case "skills.status":
        return provider.skillsStatus(task.payload as SkillsStatusParams);
      case "memory.replace":
        return provider.memoryReplace(task.payload as MemoryReplaceParams);
      case "session.reset":
        return provider.sessionReset(task.payload as SessionResetParams);
      case "agent.run":
        return provider.agentRun(task.payload as AgentRunParams);
      default:
        throw new Error(`unknown action: ${task.action}`);
    }
  }

  async function run(tasks: Task[]): Promise<ExecutorResult> {
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Record<string, string> = {};
    const results: Record<string, unknown> = {};

    for (const task of tasks) {
      if (state.executed[task.id]) {
        skipped += 1;
        continue;
      }
      try {
        const result = await dispatch(task);
        state.executed[task.id] = true;
        processed += 1;
        if (
          task.action === "skills.status" ||
          task.action === "fleet.gateway.probe" ||
          task.action === "config.get"
        ) {
          results[task.id] = result;
        }
      } catch (err) {
        errors[task.id] = err instanceof Error ? err.message : String(err);
        failed += 1;
      }
    }

    return { processed, skipped, failed, errors, results };
  }

  return {
    run,
  };
}
