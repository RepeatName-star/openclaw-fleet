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
});

