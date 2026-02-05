import type {
  ConfigPatchParams,
  MemoryReplaceParams,
  SessionResetParams,
  SidecarProvider,
  SkillsInstallParams,
  SkillsUpdateParams,
  AgentRunParams,
} from "./providers/types.js";

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
};

type ExecutorOptions = {
  provider: SidecarProvider;
  state: ExecutorState;
};

export function createExecutor(options: ExecutorOptions) {
  const { provider, state } = options;

  async function dispatch(task: Task) {
    switch (task.action) {
      case "config.patch":
        return provider.configPatch(task.payload as ConfigPatchParams);
      case "skills.install":
        return provider.skillsInstall(task.payload as SkillsInstallParams);
      case "skills.update":
        return provider.skillsUpdate(task.payload as SkillsUpdateParams);
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

    for (const task of tasks) {
      if (state.executed[task.id]) {
        skipped += 1;
        continue;
      }
      try {
        await dispatch(task);
        state.executed[task.id] = true;
        processed += 1;
      } catch {
        failed += 1;
      }
    }

    return { processed, skipped, failed };
  }

  return {
    run,
  };
}
