import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 3000);

const app = await buildServer();
await app.listen({ port, host: "0.0.0.0" });

const address = app.server.address();
if (typeof address === "object" && address) {
  console.log(`listening on ${address.address}:${address.port}`);
}
