import type {
  ArtifactItem,
  CampaignItem,
  EventItem,
  GroupItem,
  GroupMatchItem,
  InstanceFileItem,
  InstanceFileSaveResult,
  InstanceLabelItem,
  OverviewStats,
  PaginatedItems,
  InstanceSummary,
  SkillBundleItem,
  TaskAttempt,
  TaskItem,
} from "../types";

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type ApiClient = {
  listInstances: () => Promise<InstanceSummary[]>;
  listInstancesPage: (filters?: {
    q?: string;
    page?: number;
    page_size?: number;
  }) => Promise<PaginatedItems<InstanceSummary>>;
  getInstance: (id: string) => Promise<InstanceSummary>;
  updateInstance: (
    id: string,
    data: { name?: string; display_name?: string; control_ui_url?: string },
  ) => Promise<InstanceSummary>;
  listInstanceFiles: (instanceId: string) => Promise<InstanceFileItem[]>;
  getInstanceFile: (instanceId: string, name: string) => Promise<InstanceFileItem>;
  updateInstanceFile: (
    instanceId: string,
    name: string,
    data: { content: string },
  ) => Promise<InstanceFileSaveResult>;
  getOverview: () => Promise<OverviewStats>;
  listTasks: (filters?: Record<string, string>) => Promise<TaskItem[]>;
  listTasksPage: (filters?: {
    q?: string;
    action?: string;
    status?: string;
    task_origin?: string;
    page?: number;
    page_size?: number;
  }) => Promise<PaginatedItems<TaskItem>>;
  getTask: (id: string) => Promise<any>;
  getTaskAttempts: (id: string) => Promise<TaskAttempt[]>;
  createTask: (data: {
    target_type: string;
    target_id: string;
    task_name?: string;
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

  listCampaigns: (filters?: { include_deleted?: boolean }) => Promise<CampaignItem[]>;
  getCampaign: (id: string) => Promise<CampaignItem>;
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
  deleteCampaign: (id: string) => Promise<void>;

  listEvents: (filters?: {
    task_id?: string;
    campaign_id?: string;
    instance_id?: string;
    event_type?: string;
    limit?: number;
  }) => Promise<EventItem[]>;
  listEventsPage: (filters?: {
    task_id?: string;
    campaign_id?: string;
    instance_id?: string;
    event_type?: string;
    page?: number;
    page_size?: number;
  }) => Promise<PaginatedItems<EventItem>>;
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
  deleteSkillBundle: (id: string) => Promise<void>;
};

export function createApiClient(baseUrl = "", fetcher: Fetcher = fetch): ApiClient {
  const prefix = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`${prefix}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `request failed: ${res.status}`);
    }
    const text = await res.text();
    if (!text.trim()) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
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

  async function listTasksPageRequest(filters: {
    q?: string;
    action?: string;
    status?: string;
    task_origin?: string;
    page?: number;
    page_size?: number;
  } = {}) {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    const suffix = params ? `?${params}` : "";
    const data = await request<PaginatedItems<TaskItem>>(`/v1/tasks${suffix}`);
    return {
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      page_size: data.page_size ?? 10,
    };
  }

  async function listEventsPageRequest(filters: {
    task_id?: string;
    campaign_id?: string;
    instance_id?: string;
    event_type?: string;
    page?: number;
    page_size?: number;
    limit?: number;
  } = {}) {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    const suffix = params ? `?${params}` : "";
    const data = await request<PaginatedItems<EventItem>>(`/v1/events${suffix}`);
    return {
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      page_size: data.page_size ?? 10,
    };
  }

  return {
    async listInstances() {
      const firstPage = await request<PaginatedItems<InstanceSummary>>("/v1/instances");
      const items = [...(firstPage.items ?? [])];
      const total = typeof firstPage.total === "number" ? firstPage.total : items.length;
      const pageSize = typeof firstPage.page_size === "number" ? firstPage.page_size : 0;
      const startPage = typeof firstPage.page === "number" ? firstPage.page : 1;

      if (!pageSize || items.length >= total) {
        return items;
      }

      for (let page = startPage + 1; items.length < total; page += 1) {
        const nextPage = await request<PaginatedItems<InstanceSummary>>(
          `/v1/instances?page=${page}&page_size=${pageSize}`,
        );
        const nextItems = nextPage.items ?? [];
        if (nextItems.length === 0) {
          break;
        }
        items.push(...nextItems);
      }

      return items;
    },
    async listInstancesPage(filters = {}) {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
          .map(([key, value]) => [key, String(value)]),
      ).toString();
      const suffix = params ? `?${params}` : "";
      const data = await request<PaginatedItems<InstanceSummary>>(`/v1/instances${suffix}`);
      return {
        items: data.items ?? [],
        total: data.total ?? 0,
        page: data.page ?? 1,
        page_size: data.page_size ?? 10,
      };
    },
    async getInstance(id: string) {
      return request<InstanceSummary>(`/v1/instances/${id}`);
    },
    async updateInstance(
      id: string,
      data: { name?: string; display_name?: string; control_ui_url?: string },
    ) {
      return request<InstanceSummary>(`/v1/instances/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async listInstanceFiles(instanceId: string) {
      const data = await request<{ items: InstanceFileItem[] }>(`/v1/instances/${instanceId}/files`);
      return data.items ?? [];
    },
    async getInstanceFile(instanceId: string, name: string) {
      return request<InstanceFileItem>(`/v1/instances/${instanceId}/files/${encodeURIComponent(name)}`);
    },
    async updateInstanceFile(instanceId: string, name: string, data: { content: string }) {
      return request<InstanceFileSaveResult>(`/v1/instances/${instanceId}/files/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    async getOverview() {
      return request<OverviewStats>("/v1/overview");
    },
    async listTasks(filters = {}) {
      const data = await listTasksPageRequest(filters);
      return data.items ?? [];
    },
    async listTasksPage(filters = {}) {
      return listTasksPageRequest(filters);
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
      task_name?: string;
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
      await request<{ ok: true }>(`/v1/instances/${instanceId}/labels/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
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
      await request<{ ok: true }>(`/v1/groups/${id}/delete`, { method: "POST" });
    },
    async getGroupMatches(id: string) {
      const data = await request<{ items: GroupMatchItem[] }>(`/v1/groups/${id}/matches`);
      return data.items ?? [];
    },

    async listCampaigns(filters = {}) {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      const suffix = params ? `?${params}` : "";
      const data = await request<{ items: CampaignItem[] }>(`/v1/campaigns${suffix}`);
      return data.items ?? [];
    },
    async getCampaign(id: string) {
      return request<CampaignItem>(`/v1/campaigns/${id}`);
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
    async deleteCampaign(id: string) {
      await request<{ ok: true }>(`/v1/campaigns/${id}/delete`, {
        method: "POST",
      });
    },

    async listEvents(filters = {}) {
      const data = await listEventsPageRequest(filters);
      return data.items ?? [];
    },
    async listEventsPage(filters = {}) {
      return listEventsPageRequest(filters);
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
    async deleteSkillBundle(id: string) {
      await request<{ ok: true }>(`/v1/skill-bundles/${id}/delete`, { method: "POST" });
    },
  };
}
