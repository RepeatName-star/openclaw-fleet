type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createFleetClient(opts: { baseUrl: string; fetch?: FetchLike }) {
  const fetcher = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/$/, "");

  async function getJson(path: string) {
    const res = await fetcher(`${baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`request failed: ${path}`);
    }
    return res.json();
  }

  async function postJson(path: string, body: unknown) {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`request failed: ${path}`);
    }
    return res.json().catch(() => ({}));
  }

  async function patchJson(path: string, body: unknown) {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`request failed: ${path}`);
    }
    return res.json().catch(() => ({}));
  }

  async function deleteJson(path: string) {
    const res = await fetcher(`${baseUrl}${path}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(`request failed: ${path}`);
    }
    return res.json().catch(() => ({}));
  }

  return {
    listCampaigns: () => getJson("/v1/campaigns"),
    createCampaign: (body: unknown) => postJson("/v1/campaigns", body),
    closeCampaign: (id: string) => postJson(`/v1/campaigns/${id}/close`, {}),

    listGroups: () => getJson("/v1/groups"),
    createGroup: (body: unknown) => postJson("/v1/groups", body),
    groupMatches: (id: string) => getJson(`/v1/groups/${id}/matches`),

    listInstanceLabels: (instanceId: string) => getJson(`/v1/instances/${instanceId}/labels`),
    upsertInstanceLabel: (instanceId: string, body: unknown) =>
      postJson(`/v1/instances/${instanceId}/labels`, body),
    deleteInstanceLabel: (instanceId: string, key: string) =>
      deleteJson(`/v1/instances/${instanceId}/labels/${encodeURIComponent(key)}`),
  };
}
