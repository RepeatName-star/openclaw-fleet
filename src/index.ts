import { loadConfig } from "./config";
import { buildServer } from "./server";

const config = loadConfig(process.env);
const app = await buildServer();

await app.listen({ port: config.port, host: "0.0.0.0" });

const address = app.server.address();
if (typeof address === "object" && address) {
  console.log(`listening on ${address.address}:${address.port}`);
}
