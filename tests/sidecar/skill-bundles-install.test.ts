import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createExecutor } from "../../src/sidecar/executor.js";

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

test("fleet.skill_bundle.install downloads and extracts into ~/.openclaw-fleet/skills", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-skill-"));
  const skillsDir = path.join(tmpRoot, "skills");
  const srcDir = path.join(tmpRoot, "bundle-src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, "hello.txt"), "hi");

  const tarPath = path.join(tmpRoot, "bundle.tar.gz");
  execFileSync("tar", ["-czf", tarPath, "-C", srcDir, "."]);
  const bytes = fs.readFileSync(tarPath);
  const sha256 = sha256Hex(bytes);

  const state = { executed: {} } as any;
  let patched: any = null;

  const provider = {
    configGet: async () => ({ baseHash: "h1" }),
    configPatch: async (params: any) => {
      patched = params;
    },
  } as any;

  const controlPlane = {
    downloadSkillBundle: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as any;

  const exec = createExecutor({ provider, state, controlPlane, deviceToken: "t", skillsDir } as any);
  const res = await exec.run([
    {
      id: "t1",
      action: "fleet.skill_bundle.install",
      payload: { bundleId: "b1", name: "demo-skill", sha256 },
    } as any,
  ]);
  expect(res.failed).toBe(0);

  const installed = fs.readFileSync(path.join(skillsDir, "demo-skill", "hello.txt"), "utf-8");
  expect(installed).toBe("hi");
  expect(patched.baseHash).toBe("h1");
  expect(String(patched.raw)).toContain("extraDirs");
  expect(String(patched.raw)).toContain(skillsDir);
});

