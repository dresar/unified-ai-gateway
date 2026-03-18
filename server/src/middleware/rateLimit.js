import { config } from "../config.js";

const lua = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local current = redis.call("INCR", key)
if current == 1 then
  redis.call("PEXPIRE", key, windowMs)
end

local ttl = redis.call("PTTL", key)
local remaining = limit - current
if remaining < 0 then remaining = 0 end

return { current, ttl, remaining }
`;

export const rateLimit = (redis, { keyPrefix = "rl", limit = config.rateLimitDefault, windowMs = config.rateLimitWindowMs, onLimitExceeded } = {}) =>
  async (c, next) => {
    const user = c.get("user");
    const apiKeyId = c.get("apiKey")?.id ?? null;
    const resolvedLimit = typeof limit === "function" ? Number(limit(c)) : Number(limit);
    const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit > 0 ? resolvedLimit : config.rateLimitDefault;

    const idPart = apiKeyId ?? user?.id ?? "anon";
    const route = c.req.path;
    const key = `${keyPrefix}:${idPart}:${route}`;

    const now = Date.now();
    const [current, ttl, remaining] = await redis.eval(lua, {
      keys: [key],
      arguments: [String(now), String(windowMs), String(safeLimit)],
    });
    const state = {
      key,
      limit: safeLimit,
      current: Number(current),
      remaining: Number(remaining),
      ttl: Number(ttl),
      resetAt: now + Number(ttl),
    };
    c.set("rateLimit", state);

    c.header("X-RateLimit-Limit", String(safeLimit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + Number(ttl)) / 1000)));

    if (Number(current) > safeLimit) {
      if (typeof onLimitExceeded === "function") {
        await onLimitExceeded(c, state)
      }
      return c.json({ error: "Rate limited" }, 429);
    }
    return next();
  };

