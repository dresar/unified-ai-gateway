import { config } from "../config.js";
import { safeEqualHex, sha256Hex, signHmacHex } from "../security/hmac.js";

export const hmacAuth = () => async (c, next) => {
  const signature = c.req.header("x-signature") ?? "";
  if (!signature || signature.length < 16) return next();

  const secret = c.get("hmacSecret");
  if (!secret) return c.json({ error: "Invalid signature" }, 401);

  const tsRaw = c.req.header("x-timestamp") ?? "";
  const nonce = c.req.header("x-nonce") ?? "";

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return c.json({ error: "Invalid signature" }, 401);
  if (!nonce || nonce.length < 8) return c.json({ error: "Invalid signature" }, 401);

  const now = Date.now();
  if (Math.abs(now - ts) > config.hmacMaxSkewMs) return c.json({ error: "Invalid signature" }, 401);

  // Mode no-Redis: nonce tetap wajib dikirim, tapi replay storage lintas instance dimatikan sementara.
  const method = c.req.method.toUpperCase();
  const url = new URL(c.req.url);
  const path = url.pathname + url.search;

  const raw = await c.req.raw.clone().arrayBuffer();
  const bodyHash = sha256Hex(Buffer.from(raw));
  const message = `${ts}.${nonce}.${method}.${path}.${bodyHash}`;
  const expected = signHmacHex(secret, message);

  if (!safeEqualHex(expected, signature)) return c.json({ error: "Invalid signature" }, 401);
  return next();
};
