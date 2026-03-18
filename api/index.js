import { handle } from '@hono/node-server/vercel';
import { createServerContext, createApp } from '../server/src/app.js';

// Context di-cache per worker (warm start); createServerContext sudah serverless-safe
// (no setInterval di serverless, ws.broadcast no-op bila tidak ada WebSocket server).
export const maxDuration = 60;

let appPromise;

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = (async () => {
      const ctx = await createServerContext();
      const honoApp = createApp(ctx);
      return handle(honoApp);
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  const app = await appPromise;
  return app(req, res);
}
