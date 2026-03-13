import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("cli: artifacts get calls /v1/artifacts/:id", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "artifacts", "get", "a1"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "a1" }), { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/artifacts/a1");
  expect(out.join("")).toBe(JSON.stringify({ id: "a1" }) + "\n");
});

test("cli: events export writes response body to stdout", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "events", "export", "--format", "jsonl"],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("line1\nline2\n", { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/events/export?format=jsonl");
  expect(out.join("")).toBe("line1\nline2\n");
});

test("cli: events export --out writes response body to file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cli-"));
  const outPath = path.join(tmp, "events.jsonl");
  const { io } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "events", "export", "--format", "jsonl", "--out", outPath],
    {},
    io as any,
    async () => new Response("x\n", { status: 200 }) as any,
  );

  expect(code).toBe(0);
  expect(fs.readFileSync(outPath, "utf-8")).toBe("x\n");
});

test("cli: bundles upload reads file and posts base64 content", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-cli-"));
  const bundlePath = path.join(tmp, "b.tar.gz");
  fs.writeFileSync(bundlePath, "hello");

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const { io, out } = createMockIo();

  const code = await runCli(
    ["--base-url", "http://x", "bundles", "upload", "--name", "demo", "--file", bundlePath],
    {},
    io as any,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "b1" }), { status: 200 }) as any;
    },
  );

  expect(code).toBe(0);
  expect(calls[0].url).toBe("http://x/v1/skill-bundles");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    name: "demo",
    format: "tar.gz",
    content_base64: Buffer.from("hello", "utf-8").toString("base64"),
  });
  expect(out.join("")).toBe(JSON.stringify({ id: "b1" }) + "\n");
});

