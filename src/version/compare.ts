type Parsed = { kind: "calver" | "semver"; parts: [number, number, number] };

function parseCalVer(input: string): Parsed | null {
  const m = input.match(/^(\d{4})\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { kind: "calver", parts: [year, month, day] };
}

function parseSemVer(input: string): Parsed | null {
  const m = input.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { kind: "semver", parts: [major, minor, patch] };
}

function parseVersion(input: string): Parsed | null {
  return parseCalVer(input) ?? parseSemVer(input);
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) {
    throw new Error(`unparseable version: ${!pa ? a : b}`);
  }
  if (pa.kind !== pb.kind) {
    throw new Error(`unparseable version: kind mismatch (${pa.kind} vs ${pb.kind})`);
  }

  for (let i = 0; i < 3; i++) {
    if (pa.parts[i] > pb.parts[i]) return 1;
    if (pa.parts[i] < pb.parts[i]) return -1;
  }
  return 0;
}

