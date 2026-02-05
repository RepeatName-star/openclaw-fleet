import { loadSidecarConfig } from "./config";

export async function startSidecar(env: NodeJS.ProcessEnv = process.env) {
  const config = loadSidecarConfig(env);
  return config;
}

if (process.argv[1] && process.argv[1].includes("cli")) {
  startSidecar().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
