import { createApiClient } from "../../ui/src/api/client.js";

test("UI API client exposes v0.1 bulk management methods", () => {
  const api = createApiClient("", (async () => {
    throw new Error("not used");
  }) as any);

  expect(typeof (api as any).getInstanceLabels).toBe("function");
  expect(typeof (api as any).upsertInstanceLabel).toBe("function");
  expect(typeof (api as any).deleteInstanceLabel).toBe("function");

  expect(typeof (api as any).listGroups).toBe("function");
  expect(typeof (api as any).createGroup).toBe("function");
  expect(typeof (api as any).patchGroup).toBe("function");
  expect(typeof (api as any).deleteGroup).toBe("function");
  expect(typeof (api as any).getGroupMatches).toBe("function");

  expect(typeof (api as any).listCampaigns).toBe("function");
  expect(typeof (api as any).createCampaign).toBe("function");
  expect(typeof (api as any).patchCampaign).toBe("function");
  expect(typeof (api as any).closeCampaign).toBe("function");

  expect(typeof (api as any).listEvents).toBe("function");
  expect(typeof (api as any).getArtifact).toBe("function");

  expect(typeof (api as any).listSkillBundles).toBe("function");
  expect(typeof (api as any).uploadSkillBundle).toBe("function");
  expect(typeof (api as any).downloadSkillBundle).toBe("function");
  expect(typeof (api as any).deleteSkillBundle).toBe("function");
});

test("UI API client uses POST alias for label, group, and bundle deletion", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 200 }) as any);
  const api = createApiClient("", fetcher as any);

  await expect(api.deleteInstanceLabel("i-1", "biz.openclaw.io/master")).resolves.toBeUndefined();
  await expect(api.deleteGroup("g-1")).resolves.toBeUndefined();
  await expect(api.deleteSkillBundle("b-1")).resolves.toBeUndefined();

  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    "/v1/instances/i-1/labels/delete",
    expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "biz.openclaw.io/master" }),
    }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    "/v1/groups/g-1/delete",
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    3,
    "/v1/skill-bundles/b-1/delete",
    expect.objectContaining({ method: "POST" }),
  );
});
