import { WebSocketServer } from "ws";
import { verifyJwt } from "../security/jwt.js";

export const createWsHub = () => {
  const clients = new Map();

  const attach = (httpServer) => {
    // WebSocket is not supported in Vercel Serverless functions directly
    // This will only work in Node.js long-running server
    if (!httpServer) return;
    
    // In serverless environment, WebSocketServer might throw or not work
    try {
      const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
      wss.on("connection", async (ws, req) => {
        try {
          const url = new URL(req.url ?? "/ws", "http://localhost");
          const token = url.searchParams.get("token") ?? "";
          const payload = token ? await verifyJwt(token) : null;
          const tenantId = payload?.sub ? String(payload.sub) : null;
          if (!tenantId) {
            ws.close(1008, "Unauthorized");
            return;
          }
          clients.set(ws, tenantId);
        } catch {
          ws.close(1008, "Unauthorized");
          return;
        }
        ws.on("close", () => clients.delete(ws));
        ws.on("error", () => clients.delete(ws));
      });
    } catch (e) {
      // Ignore websocket errors in serverless
    }
  };

  const broadcast = (event) => {
    // Silent fail in serverless if no clients
    if (clients.size === 0) return;
    
    const payload = JSON.stringify(event);
    for (const [ws] of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  };

  const broadcastToTenant = (tenantId, event) => {
    if (!tenantId || clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const [ws, clientTenantId] of clients) {
      if (clientTenantId !== tenantId) continue;
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  };

  return { attach, broadcast, broadcastToTenant };
};

