import type {
  ArtifactItem,
  CampaignItem,
  EventItem,
  GroupItem,
  GroupMatchItem,
  InstanceLabelItem,
  InstanceSummary,
  SkillBundleItem,
  TaskAttempt,
  TaskItem,
} from "../types";

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type ApiClient = {
  listInstances: () => Promise<InstanceSummary[]>;
  getInstance: (id: string) => Promise<InstanceSummary>;
  updateInstance: (id: string, data: { name?: string; control_ui_url?: string }) => Promise<InstanceSummary>;
  listTasks: (filters?: Record<string, string>) => Promise<TaskItem[]>;
  getTask: (id: string) => Promise<any>;
  getTaskAttempts: (id: string) => Promise<TaskAttempt[]>;
  createTask: (data: {
    target_type: string;
    target_id: string;
    action: string;
    payload?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  getInstanceSkills: (id: string) => Promise<{ skills: any; updated_at?: string }>;

  getInstanceLabels: (instanceId: string) => Promise<InstanceLabelItem[]>;
  upsertInstanceLabel: (instanceId: string, data: { key: string; value: string }) => Promise<void>;
  deleteInstanceLabel: (instanceId: string, key: string) => Promise<void>;

  listGroups: () => Promise<GroupItem[]>;
  createGroup: (data: { name: string; selector: string; description?: string }) => Promise<GroupItem>;
  patchGroup: (id: string, data: { name?: string; selector?: string; description?: string }) => Promise<GroupItem>;
  deleteGroup: (id: string) => Promise<void>;
  getGroupMatches: (id: string) => Promise<GroupMatchItem[]>;

  listCampaigns: () => Promise<CampaignItem[]>;
  createCampaign: (data: {
    name: string;
    selector: string;
    action: string;
    payload?: Record<string, unknown>;
    gate?: Record<string, unknown>;
    rollout?: Record<string, unknown>;
    expires_at?: string;
  }) => Promise<CampaignItem>;
  patchCampaign: (
    id: string,
    data: {
      name?: string;
      selector?: string;
      action?: string;
      payload?: Record<string, unknown>;
      gate?: Record<string, unknown>;
      rollout?: Record<string, unknown>;
      expires_at?: string;
    },
  ) => Promise<CampaignItem>;
  closeCampaign: (id: string) => Promise<{ id: string; status: string; closed_at: string }>;

  listEvents: (filters?: {
    campaign_id?: string;
    instance_id?: string;
    event_type?: string;
    limit?: number;
  }) => Promise<EventItem[]>;
  exportEvents: (filters: {
    campaign_id?: string;
    instance_id?: string;
    event_type?: string;
    format?: "jsonl" | "csv";
  }) => Promise<string>;

  getArtifact: (id: string) => Promise<ArtifactItem>;

  listSkillBundles: () => Promise<SkillBundleItem[]>;
  uploadSkillBundle: (data: {
    name: string;
    format?: "tar.gz";
    content_base64: string;
  }) => Promise<SkillBundleItem>;
  downloadSkillBundle: (id: string) => Promise<ArrayBuffer>;
};

export function createApiClient(baseUrl = "", fetcher: Fetcher = fetch): ApiClient {
  const prefix = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`${prefix}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `request failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async function requestText(path: string, init?: RequestInit): Promise<string> {
    const res = await fetcher(`${prefix}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `request failed: ${res.status}`);
    }
    return await res.text();
  }

  async function requestArrayBuffer(path: string, init?: RequestInit): Promise<ArrayBuffer> {
    const res = await fetcher(`${prefix}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `request failed: ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  return {
    async listInstances() {
      const data = await request<{ items: InstanceSummary[] }>("/v1/instances");
      return data.items ?? [];
    },
    async getInstance(id: string) {
      return request<InstanceSummary>(`/v1/instances/${id}`);
    },
    async updateInstance(id: string, data: { name?: string; control_ui_url?: string }) {
      return request<InstanceSummary>(`/v1/instances/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async listTasks(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      const suffix = params ? `?${params}` : "";
      const data = await request<{ items: TaskItem[] }>(`/v1/tasks${suffix}`);
      return data.items ?? [];
    },
    async getTask(id: string) {
      return request<any>(`/v1/tasks/${id}`);
    },
    async getTaskAttempts(id: string) {
      const data = await request<{ items: TaskAttempt[] }>(`/v1/tasks/${id}/attempts`);
      return data.items ?? [];
    },
    async createTask(data: {
      target_type: string;
      target_id: string;
      action: string;
      payload?: Record<string, unknown>;
    }) {
      return request<{ id: string }>("/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async getInstanceSkills(id: string) {
      return request<{ skills: any; updated_at?: string }>(`/v1/instances/${id}/skills`);
    },

    async getInstanceLabels(instanceId: string) {
      const data = await request<{ items: InstanceLabelItem[] }>(`/v1/instances/${instanceId}/labels`);
      return data.items ?? [];
    },
    async upsertInstanceLabel(instanceId: string, data: { key: string; value: string }) {
      await request<{ ok: true }>(`/v1/instances/${instanceId}/labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async deleteInstanceLabel(instanceId: string, key: string) {
      const encoded = encodeURIComponent(key);
      await request<{ ok: true }>(`/v1/instances/${instanceId}/labels/${encoded}`, {
        method: "DELETE",
      });
    },

    async listGroups() {
      const data = await request<{ items: GroupItem[] }>("/v1/groups");
      return data.items ?? [];
    },
    async createGroup(data: { name: string; selector: string; description?: string }) {
      return request<GroupItem>("/v1/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async patchGroup(id: string, data: { name?: string; selector?: string; description?: string }) {
      return request<GroupItem>(`/v1/groups/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async deleteGroup(id: string) {
      await request<{ ok: true }>(`/v1/groups/${id}`, { method: "DELETE" });
    },
    async getGroupMatches(id: string) {
      const data = await request<{ items: GroupMatchItem[] }>(`/v1/groups/${id}/matches`);
      return data.items ?? [];
    },

    async listCampaigns() {
      const data = await request<{ items: CampaignItem[] }>("/v1/campaigns");
      return data.items ?? [];
    },
    async createCampaign(data: {
      name: string;
      selector: string;
      action: string;
      payload?: Record<string, unknown>;
      gate?: Record<string, unknown>;
      rollout?: Record<string, unknown>;
      expires_at?: string;
    }) {
      return request<CampaignItem>("/v1/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async patchCampaign(
      id: string,
      data: {
        name?: string;
        selector?: string;
        action?: string;
        payload?: Record<string, unknown>;
        gate?: Record<string, unknown>;
        rollout?: Record<string, unknown>;
        expires_at?: string;
      },
    ) {
      return request<CampaignItem>(`/v1/campaigns/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async closeCampaign(id: string) {
      return request<{ id: string; status: string; closed_at: string }>(`/v1/campaigns/${id}/close`, {
        method: "POST",
      });
    },

    async listEvents(filters = {}) {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      const suffix = params ? `?${params}` : "";
      const data = await request<{ items: EventItem[] }>(`/v1/events${suffix}`);
      return data.items ?? [];
    },
    async exportEvents(filters: {
      campaign_id?: string;
      instance_id?: string;
      event_type?: string;
      format?: "jsonl" | "csv";
    }) {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      const suffix = params ? `?${params}` : "";
      return requestText(`/v1/events/export${suffix}`);
    },

    async getArtifact(id: string) {
      return request<ArtifactItem>(`/v1/artifacts/${id}`);
    },

    async listSkillBundles() {
      const data = await request<{ items: SkillBundleItem[] }>("/v1/skill-bundles");
      return data.items ?? [];
    },
    async uploadSkillBundle(data: { name: string; format?: "tar.gz"; content_base64: string }) {
      return request<SkillBundleItem>("/v1/skill-bundles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async downloadSkillBundle(id: string) {
      return requestArrayBuffer(`/v1/skill-bundles/${id}/download`);
    },
  };
}
