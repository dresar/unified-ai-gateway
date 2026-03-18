import { hashApiKey, getApiKey } from "../services/apiKeys.js";
import bcrypt from "bcryptjs";

function getApiKeyFromRequest(c) {
  const fromHeader = c.req.header("x-api-key");
  if (fromHeader) return fromHeader.trim();
  const auth = c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

export const apiKeyAuth = ({ l1, l2, db, redis, ws }) => async (c, next) => {
  const plain = getApiKeyFromRequest(c);
  if (!plain) {
    return c.json({ error: "Missing API key (use X-API-Key or Authorization: Bearer <key>)" }, 401);
  }

  // 1. Hash the key
  const keyHash = hashApiKey(plain);

  // 2. Get API Key (L1 -> L2 -> DB)
  const apiKey = await getApiKey({ db, l1, l2 }, keyHash);

  if (!apiKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // 3. Check status
  const now = Date.now();
  if (apiKey.status !== "active") {
    const graceUntil = apiKey.grace_until ? new Date(apiKey.grace_until).getTime() : 0;
    if (!graceUntil || now > graceUntil) {
      return c.json({ error: "API key disabled" }, 403);
    }
  }

  // 4. Client auth: if this key has client_username, require Basic Auth
  if (apiKey.client_username && apiKey.client_password_hash) {
    const auth = c.req.header("authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return c.json({ error: "This API key requires Basic Auth (Authorization: Basic <base64(username:password)>)" }, 401);
    }
    let decoded;
    try {
      decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    } catch {
      return c.json({ error: "Invalid Basic Auth header" }, 401);
    }
    const colon = decoded.indexOf(":");
    const username = (colon >= 0 ? decoded.slice(0, colon) : decoded).trim();
    const password = colon >= 0 ? decoded.slice(colon + 1) : "";
    const expectedUser = (apiKey.client_username || "").trim();
    const passwordOk = await bcrypt.compare(password, apiKey.client_password_hash);
    if (username !== expectedUser || !passwordOk) {
      return c.json({ error: "Invalid client username or password" }, 401);
    }
  }

  c.set("apiKey", apiKey);

  await next();
};

