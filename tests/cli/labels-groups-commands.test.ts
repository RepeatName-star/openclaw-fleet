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

test("cli: labels get calls /v1/instances/:id/labels", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "labels", "get", "i1"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/instances/i1/labels");
  expect(out.join("")).toBe(JSON.stringify({ items: [] }) + "\n");
});

test("cli: labels set calls POST /v1/instances/:id/labels", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "labels", "set", "i1", "biz.openclaw.io/team", "a"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/instances/i1/labels");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    key: "biz.openclaw.io/team",
    value: "a",
  });
});

test("cli: labels del calls DELETE /v1/instances/:id/labels/:key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "labels", "del", "i1", "biz.openclaw.io/team"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/instances/i1/labels/biz.openclaw.io%2Fteam");
  expect(calls[0].init?.method).toBe("DELETE");
});

test("cli: groups list calls /v1/groups", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "groups", "list"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/groups");
});

test("cli: groups create calls POST /v1/groups", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "groups", "create", "--name", "g1", "--selector", "biz.openclaw.io/team=a"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "g1" }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/groups");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    name: "g1",
    selector: "biz.openclaw.io/team=a",
  });
});

test("cli: groups matches calls /v1/groups/:id/matches", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io } = createMockIo();
  const code = await runCli(
    ["--base-url", "http://x", "groups", "matches", "g1"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }), { status: 200 }) as any;
    },
  );
  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/groups/g1/matches");
});

