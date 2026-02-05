import type {
  AgentRunParams,
  ConfigPatchParams,
  MemoryReplaceParams,
  SessionResetParams,
  SidecarProvider,
  SkillsInstallParams,
  SkillsUpdateParams,
} from "./types.js";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type GenericProviderOptions = {
  baseUrl: string;
  fetch?: FetchLike;
};

export function createGenericHttpProvider(options: GenericProviderOptions): SidecarProvider {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetcher = options.fetch ?? fetch;

  async function post(path: string, body: unknown): Promise<void> {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`generic provider request failed: ${path}`);
    }
  }

  return {
    async configPatch(params: ConfigPatchParams) {
      await post("/config/patch", params);
    },
    async skillsInstall(params: SkillsInstallParams) {
      await post("/skills/install", params);
    },
    async skillsUpdate(params: SkillsUpdateParams) {
      await post("/skills", params);
    },
    async memoryReplace(params: MemoryReplaceParams) {
      await post("/memory", params);
    },
    async sessionReset(params: SessionResetParams) {
      await post("/sessions/reset", params);
    },
    async agentRun(params: AgentRunParams) {
      await post("/agent/run", params);
    },
  };
}
