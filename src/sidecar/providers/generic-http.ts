import type {
  AgentRunParams,
  ConfigGetParams,
  ConfigGetResult,
  ConfigPatchParams,
  GatewayProbeParams,
  GatewayProbeResult,
  MemoryReplaceParams,
  SessionResetParams,
  SidecarProvider,
  SkillsInstallParams,
  SkillsStatusParams,
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

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`generic provider request failed: ${path}`);
    }
    return res.json().catch(() => ({}));
  }

  return {
    async gatewayProbe(params: GatewayProbeParams): Promise<GatewayProbeResult> {
      const res = await postJson("/gateway/probe", params);
      const reachable = Boolean((res as any)?.gateway_reachable);
      const version = (res as any)?.openclaw_version;
      if (version && typeof version === "string") {
        return { gateway_reachable: reachable, openclaw_version: version };
      }
      return { gateway_reachable: reachable };
    },
    async configGet(params: ConfigGetParams): Promise<ConfigGetResult> {
      return postJson("/config/get", params) as Promise<ConfigGetResult>;
    },
    async configPatch(params: ConfigPatchParams) {
      await post("/config/patch", params);
    },
    async skillsInstall(params: SkillsInstallParams) {
      await post("/skills/install", params);
    },
    async skillsUpdate(params: SkillsUpdateParams) {
      await post("/skills", params);
    },
    async skillsStatus(params: SkillsStatusParams) {
      return postJson("/skills/status", params);
    },
    async memoryReplace(params: MemoryReplaceParams) {
      await post("/memory", params);
    },
    async sessionReset(params: SessionResetParams) {
      await post("/sessions/reset", params);
    },
    async agentRun(params: AgentRunParams) {
      return postJson("/agent/run", params);
    },
  };
}
