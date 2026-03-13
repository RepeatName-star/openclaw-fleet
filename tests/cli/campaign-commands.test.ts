import { runCli } from "../../src/cli/index.js";

function createMockIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: { write: (s: string) => void out.push(s) },
      stderr: { write: (s: string) => void err.push(s) },
    },
    out,
    err,
  };
}

test("cli: campaign list calls /v1/campaigns and prints JSON", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "campaign", "list"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }), { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/campaigns");
  expect(out.join("")).toBe(JSON.stringify({ items: [] }) + "\n");
});

test("cli: campaign close calls /v1/campaigns/:id/close", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "campaign", "close", "c1"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/campaigns/c1/close");
  expect(calls[0].init?.method).toBe("POST");
});

test("cli: campaign create calls /v1/campaigns with JSON body", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();

  const code = await runCli(
    [
      "--base-url",
      "http://x",
      "campaign",
      "create",
      "--name",
      "c1",
      "--selector",
      "biz.openclaw.io/team=a",
      "--action",
      "skills.status",
      "--payload-json",
      "{\"x\":1}",
    ],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "c1" }), { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/campaigns");
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.headers).toEqual({ "content-type": "application/json" });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    name: "c1",
    selector: "biz.openclaw.io/team=a",
    action: "skills.status",
    payload: { x: 1 },
  });
  expect(out.join("")).toBe(JSON.stringify({ id: "c1" }) + "\n");
});
