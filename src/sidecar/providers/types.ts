export type ConfigPatchParams = {
  raw: string;
  baseHash?: string;
  note?: string;
  sessionKey?: string;
  restartDelayMs?: number;
};

export type FleetConfigPatchParams = Omit<ConfigPatchParams, "baseHash">;

export type ConfigGetParams = Record<string, never>;
export type ConfigGetResult = { baseHash?: string; hash?: string } & Record<string, unknown>;

export type SkillsInstallParams = {
  name: string;
  installId: string;
  timeoutMs?: number;
};

export type SkillsUpdateParams = {
  skillKey: string;
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};

export type SkillsStatusParams = Record<string, never>;

export type GatewayProbeParams = Record<string, never>;
export type GatewayProbeResult = {
  gateway_reachable: boolean;
  openclaw_version?: string;
};

export type MemoryReplaceParams = {
  agentId: string;
  content: string;
  fileName?: string;
};

export type AgentFilesListParams = {
  agentId: string;
};

export type AgentFileMeta = {
  name: string;
  path?: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
};

export type AgentFilesListResult = {
  agentId?: string;
  workspace?: string;
  files: AgentFileMeta[];
};

export type AgentFileGetParams = {
  agentId: string;
  name: string;
};

export type AgentFileGetResult = {
  agentId?: string;
  workspace?: string;
  file: AgentFileMeta & { content?: string };
};

export type AgentFileSetParams = {
  agentId: string;
  name: string;
  content: string;
};

export type AgentFileSetResult = {
  ok: boolean;
  agentId?: string;
  workspace?: string;
  file: AgentFileMeta & { content?: string };
};

export type SessionResetParams = {
  key: string;
};

export type AgentRunParams = {
  message: string;
  agentId?: string;
  sessionKey?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
};

export interface SidecarProvider {
  gatewayProbe(params: GatewayProbeParams): Promise<GatewayProbeResult>;
  configGet(params: ConfigGetParams): Promise<ConfigGetResult>;
  configPatch(params: ConfigPatchParams): Promise<void>;
  skillsInstall(params: SkillsInstallParams): Promise<void>;
  skillsUpdate(params: SkillsUpdateParams): Promise<void>;
  skillsStatus(params: SkillsStatusParams): Promise<unknown>;
  memoryReplace(params: MemoryReplaceParams): Promise<void>;
  agentFilesList(params: AgentFilesListParams): Promise<AgentFilesListResult>;
  agentFileGet(params: AgentFileGetParams): Promise<AgentFileGetResult>;
  agentFileSet(params: AgentFileSetParams): Promise<AgentFileSetResult>;
  sessionReset(params: SessionResetParams): Promise<void>;
  agentRun(params: AgentRunParams): Promise<unknown>;
}
