import "dotenv/config";
import { serve } from "@hono/node-server";
import { config } from "./src/config.js";
import { createNodeServer } from "./src/app.js";

const { ctx, app } = await createNodeServer();

const server = serve({ fetch: app.fetch, port: config.port });
ctx.ws.attach(server);
process.stdout.write(`API listening on http://localhost:${config.port}\n`);

const shutdown = async () => {
  server.close?.();
  await ctx.shutdown?.();
};

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
