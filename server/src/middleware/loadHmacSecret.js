import { randomBytes } from "node:crypto";

export const loadHmacSecret = ({ redis, db, getTenantId }) => async (c, next) => {
  const signature = c.req.header("x-signature") ?? "";
  if (!signature || signature.length < 16) {
    c.set("hmacSecret", null);
    return next();
  }

  const tenantId = getTenantId(c);
  if (!tenantId) {
    c.set("hmacSecret", null);
    return next();
  }

  const cacheKey = `hmac:${tenantId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    c.set("hmacSecret", cached);
    return next();
  }

  const { rows } = await db.query("select hmac_secret from public.users where id = $1 limit 1", [tenantId]);
  let secret = rows[0]?.hmac_secret ?? null;
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    await db.query("update public.users set hmac_secret = $1 where id = $2", [secret, tenantId]);
  }

  await redis.set(cacheKey, secret, { EX: 1800 });
  c.set("hmacSecret", secret);
  return next();
};

