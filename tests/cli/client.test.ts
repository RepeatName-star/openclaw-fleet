import { createFleetClient } from "../../src/cli/client.js";

test("fleet client builds correct URLs", async () => {
  const calls: string[] = [];
  const client = createFleetClient({
    baseUrl: "http://localhost:8080",
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ items: [] }), { status: 200 }) as any;
    },
  });

  await client.listCampaigns();
  expect(calls[0]).toBe("http://localhost:8080/v1/campaigns");
});

