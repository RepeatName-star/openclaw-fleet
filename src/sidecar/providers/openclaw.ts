import { randomUUID } from "node:crypto";
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
  SkillsUpdateParams,
} from "./types.js";
import type { GatewayClient } from "../gateway-client.js";

export type OpenClawProviderOptions = {
  gateway: GatewayClient;
};

const DEFAULT_AGENT_RUN_TIMEOUT_MS = 5 * 60_000;

export function createOpenClawProvider(options: OpenClawProviderOptions): SidecarProvider {
  const gateway = options.gateway;

  return {
    async gatewayProbe(_params: GatewayProbeParams): Promise<GatewayProbeResult> {
      const helloOk = gateway.getHelloOk?.();
      const version = (helloOk as any)?.server?.version;
      if (version && typeof version === "string") {
        return { gateway_reachable: true, openclaw_version: version };
      }
      return { gateway_reachable: false };
    },
    async configGet(params: ConfigGetParams): Promise<ConfigGetResult> {
      const result = (await gateway.request("config.get", params)) as ConfigGetResult;
      if (typeof result?.baseHash === "string" && result.baseHash.length > 0) {
        return result;
      }
      if (typeof result?.hash === "string" && result.hash.length > 0) {
        return {
          ...result,
          baseHash: result.hash,
        };
      }
      return result;
    },
    async configPatch(params: ConfigPatchParams) {
      await gateway.request("config.patch", params);
    },
    async skillsInstall(params: SkillsInstallParams) {
      await gateway.request("skills.install", params);
    },
    async skillsUpdate(params: SkillsUpdateParams) {
      await gateway.request("skills.update", params);
    },
    async skillsStatus() {
      return gateway.request("skills.status");
    },
    async memoryReplace(params: MemoryReplaceParams) {
      const fileName = params.fileName ?? "MEMORY.md";
      await gateway.request("agents.files.set", {
        agentId: params.agentId,
        name: fileName,
        content: params.content,
      });
      await gateway.request("sessions.reset", {
        key: params.agentId,
      });
    },
    async sessionReset(params: SessionResetParams) {
      await gateway.request("sessions.reset", params);
    },
    async agentRun(params: AgentRunParams) {
      return gateway.request("agent", {
        message: params.message,
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        deliver: false,
      }, { expectFinal: true, timeoutMs: params.timeoutMs ?? DEFAULT_AGENT_RUN_TIMEOUT_MS });
    },
  };
}
