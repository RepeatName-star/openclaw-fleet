import { createFleetClient } from "./client.js";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Io = {
  stdout: { write: (s: string) => unknown };
  stderr: { write: (s: string) => unknown };
};

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

function printUsage(io: Io) {
  // Keep it terse for v0.1; command list will expand in later tasks.
  io.stderr.write("usage: fleet:cli:ts --base-url <url> <command> [...args]\n");
}

function writeJsonLine(io: Io, value: unknown) {
  io.stdout.write(JSON.stringify(value) + "\n");
}

function parseStrictFlags(args: string[]): { ok: true; flags: Record<string, string> } | { ok: false; error: string } {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? "";
    if (!a.startsWith("--")) {
      return { ok: false, error: `unexpected arg: ${a}` };
    }
    const key = a.slice("--".length);
    const next = args[i + 1];
    if (!key || !next || next.startsWith("--")) {
      return { ok: false, error: `missing value for ${a}` };
    }
    flags[key] = next;
    i += 1;
  }
  return { ok: true, flags };
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: Io = { stdout: process.stdout, stderr: process.stderr },
  fetcher?: FetchLike,
): Promise<number> {
  const parsed = parseArgs(argv, env);
  if (parsed.command.length === 0) {
    printUsage(io);
    return 2;
  }

  if (!parsed.baseUrl) {
    io.stderr.write("error: missing base url (use --base-url or FLEET_BASE_URL)\n");
    return 2;
  }

  const client = createFleetClient({ baseUrl: parsed.baseUrl, fetch: fetcher });

  const [resource, sub, ...rest] = parsed.command;
  if (resource === "campaign" && sub === "list") {
    const res = await client.listCampaigns();
    writeJsonLine(io, res);
    return 0;
  }
  if (resource === "campaign" && sub === "create") {
    const parsedFlags = parseStrictFlags(rest);
    if (!parsedFlags.ok) {
      io.stderr.write(`error: ${parsedFlags.error}\n`);
      return 2;
    }
    const name = parsedFlags.flags["name"];
    const selector = parsedFlags.flags["selector"];
    const action = parsedFlags.flags["action"];
    const payloadJson = parsedFlags.flags["payload-json"];
    if (!name || !selector || !action) {
      io.stderr.write("error: campaign create requires --name, --selector, --action\n");
      return 2;
    }
    let payload: unknown = undefined;
    if (payloadJson !== undefined) {
      try {
        payload = JSON.parse(payloadJson);
      } catch {
        io.stderr.write("error: invalid --payload-json\n");
        return 2;
      }
    }
    const res = await client.createCampaign({
      name,
      selector,
      action,
      payload: payload ?? {},
    });
    writeJsonLine(io, res);
    return 0;
  }
  if (resource === "campaign" && sub === "close") {
    const id = rest[0];
    if (!id) {
      io.stderr.write("error: missing campaign id\n");
      return 2;
    }
    const res = await client.closeCampaign(id);
    writeJsonLine(io, res);
    return 0;
  }

  io.stderr.write(`error: unknown command: ${parsed.command.join(" ")}\n`);
  return 2;
}

async function main() {
  try {
    const code = await runCli(process.argv.slice(2));
    process.exitCode = code;
  } catch (err) {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].includes("/cli/index")) {
  void main();
}
