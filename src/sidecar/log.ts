import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type LogMeta = Record<string, unknown> | undefined;

let filePath: string | null | undefined;

function resolveLogPath(): string | null {
  if (filePath !== undefined) {
    return filePath;
  }
  const envPath = process.env.OPENCLAW_SIDECAR_LOG_PATH;
  if (envPath === "") {
    filePath = null;
    return filePath;
  }
  if (envPath) {
    filePath = envPath;
    return filePath;
  }
  filePath = path.join(os.homedir(), ".openclaw-fleet", "sidecar.log");
  return filePath;
}

function formatMeta(meta: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(meta)}`;
}

function appendToFile(line: string) {
  const target = resolveLogPath();
  if (!target) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${line}\n`);
  } catch {
    // Ignore file logging failures to avoid crashing the sidecar.
  }
}

function emit(level: "info" | "warn" | "error", message: string, meta?: LogMeta) {
  const ts = new Date().toISOString();
  const line = `${ts} [sidecar] ${level} ${message}${formatMeta(meta)}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
  appendToFile(line);
}

export function logInfo(message: string, meta?: LogMeta) {
  emit("info", message, meta);
}

export function logWarn(message: string, meta?: LogMeta) {
  emit("warn", message, meta);
}

export function logError(message: string, meta?: LogMeta) {
  emit("error", message, meta);
}
