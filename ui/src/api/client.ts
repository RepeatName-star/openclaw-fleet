import type { InstanceSummary, TaskAttempt, TaskItem } from "../types";

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
  getInstanceSkills: (id: string) => Promise<{ skills: any; updated_at?: string }>
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
  };
}
