import { createFleetClient } from "./client.js";

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  command: string[];
} {
  let baseUrl = env.FLEET_BASE_URL ?? "";
  const command: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--base-url") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("missing value for --base-url");
      }
      baseUrl = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    }
    command.push(...argv.slice(i));
    break;
  }

  return { baseUrl, command };
}

function printUsage() {
  // Keep it terse for v0.1; command list will expand in later tasks.
  console.error("usage: fleet:cli:ts --base-url <url> <command> [...args]");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command.length === 0) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (!parsed.baseUrl) {
    throw new Error("missing base url (use --base-url or FLEET_BASE_URL)");
  }

  // Wire client early; commands get added in later tasks.
  createFleetClient({ baseUrl: parsed.baseUrl });
  throw new Error(`unknown command: ${parsed.command.join(" ")}`);
}

if (process.argv[1] && process.argv[1].includes("/cli/index")) {
  main().catch((err) => {
    console.error(String(err));
    process.exitCode = 1;
  });
}

