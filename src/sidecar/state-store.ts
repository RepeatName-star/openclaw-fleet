import fs from "node:fs/promises";
import path from "node:path";

export type SidecarState = {
  deviceToken?: string;
  executed: Record<string, boolean>;
  lastSyncAt?: number;
};

const DEFAULT_STATE: SidecarState = {
  executed: {},
};

export function createStateStore(filePath: string) {
  async function load(): Promise<SidecarState> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      if (!raw.trim()) {
        return { ...DEFAULT_STATE };
      }
      const parsed = JSON.parse(raw) as SidecarState;
      return {
        ...DEFAULT_STATE,
        ...parsed,
        executed: parsed?.executed ?? {},
      };
    } catch (err) {
      const anyErr = err as { code?: string };
      if (anyErr.code === "ENOENT") {
        return { ...DEFAULT_STATE };
      }
      throw err;
    }
  }

  async function save(state: SidecarState): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
  }

  async function markExecuted(taskId: string): Promise<SidecarState> {
    const state = await load();
    if (state.executed[taskId]) {
      return state;
    }
    state.executed[taskId] = true;
    await save(state);
    return state;
  }

  return {
    load,
    save,
    markExecuted,
  };
}
