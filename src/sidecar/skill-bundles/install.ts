import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function execFileP(file: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(file, args, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function getExtraDirsFromConfigGetResult(cfg: unknown): string[] {
  const skills = (cfg as any)?.skills;
  const load = skills?.load;
  const extraDirs = load?.extraDirs;
  if (!Array.isArray(extraDirs)) {
    return [];
  }
  return extraDirs.filter((v) => typeof v === "string");
}

export async function installSkillBundle(params: {
  download: () => Promise<ArrayBuffer>;
  expectedSha256: string;
  bundleName: string;
  skillsRootDir: string;
  configGet: () => Promise<{ baseHash?: string } & Record<string, unknown>>;
  configPatch: (raw: string, baseHash?: string) => Promise<void>;
}): Promise<void> {
  await fs.mkdir(params.skillsRootDir, { recursive: true });

  const stagingRoot = path.join(params.skillsRootDir, ".staging");
  await fs.mkdir(stagingRoot, { recursive: true });

  const installId = randomUUID();
  const stagingWorkDir = path.join(stagingRoot, installId);
  const extractDir = path.join(stagingWorkDir, "extract");
  await fs.mkdir(extractDir, { recursive: true });

  const rawBytes = await params.download();
  const buf = Buffer.from(rawBytes);
  const got = sha256Hex(buf);
  const want = String(params.expectedSha256 ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want) || got !== want) {
    throw new Error("skill bundle sha256 mismatch");
  }

  const tarPath = path.join(stagingWorkDir, "bundle.tar.gz");
  await fs.writeFile(tarPath, buf);

  // Extract into staging dir first, then rename to destination as a best-effort atomic swap.
  await execFileP("tar", ["-xzf", tarPath, "-C", extractDir]);

  const destDir = path.join(params.skillsRootDir, params.bundleName);
  const backupDir = `${destDir}.bak-${installId}`;
  let movedExisting = false;
  try {
    if (await pathExists(destDir)) {
      await fs.rename(destDir, backupDir);
      movedExisting = true;
    }
    await fs.rename(extractDir, destDir);
  } finally {
    // Cleanup staging even if the move fails.
    await fs.rm(stagingWorkDir, { recursive: true, force: true }).catch(() => undefined);
    if (movedExisting) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const cfg = await params.configGet();
  const existing = getExtraDirsFromConfigGetResult(cfg);
  const nextExtraDirs = uniqStrings([...existing, params.skillsRootDir]);
  const rawPatch = JSON.stringify(
    {
      skills: {
        load: {
          extraDirs: nextExtraDirs,
        },
      },
    },
    null,
    2,
  );
  await params.configPatch(rawPatch, cfg.baseHash);
}

