import { createHash } from "node:crypto";

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function redactString(value: string) {
  const prefix = value.slice(0, 4);
  const hex = sha256Hex(value);
  return `${prefix}[sha256:${hex}]`;
}

function isSensitiveKey(key: string) {
  const k = key.toLowerCase();
  return k.includes("token") || k.includes("secret") || k.includes("password") || k.includes("apikey");
}

function pathKey(path: string[]) {
  return path.join("\u0000");
}

export function redactValue(
  value: unknown,
  opts:
    | { mode: "sensitive" }
    | { mode: "event"; sensitivePaths: string[][] },
  path: string[] = [],
): unknown {
  if (opts.mode === "sensitive") {
    return typeof value === "string" ? redactString(value) : value;
  }

  const sensitiveSet = new Set(opts.sensitivePaths.map((p) => pathKey(p)));
  const shouldRedactPath = sensitiveSet.has(pathKey(path));

  if (typeof value === "string") {
    return shouldRedactPath ? redactString(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, idx) => redactValue(item, opts, [...path, String(idx)]));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = [...path, k];
      const nextRedact =
        sensitiveSet.has(pathKey(nextPath)) || (typeof v === "string" && isSensitiveKey(k));
      if (nextRedact && typeof v === "string") {
        out[k] = redactString(v);
        continue;
      }
      out[k] = redactValue(v, opts, nextPath);
    }
    return out;
  }
  return value;
}

