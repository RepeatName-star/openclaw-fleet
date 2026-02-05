import { randomUUID } from "node:crypto";
import type {
  AgentRunParams,
  ConfigPatchParams,
  MemoryReplaceParams,
  SessionResetParams,
  SidecarProvider,
  SkillsInstallParams,
  SkillsUpdateParams,
} from "./types";
import type { GatewayClient } from "../gateway-client";

export type OpenClawProviderOptions = {
  gateway: GatewayClient;
};

export function createOpenClawProvider(options: OpenClawProviderOptions): SidecarProvider {
  const gateway = options.gateway;

  return {
    async configPatch(params: ConfigPatchParams) {
      await gateway.request("config.patch", params);
    },
    async skillsInstall(params: SkillsInstallParams) {
      await gateway.request("skills.install", params);
    },
    async skillsUpdate(params: SkillsUpdateParams) {
      await gateway.request("skills.update", params);
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
      await gateway.request("agent", {
        message: params.message,
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        deliver: false,
      });
    },
  };
}
