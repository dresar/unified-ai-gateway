import { config } from "../config.js";

const rateLimitScript = "rate-limit-window";

export const rateLimit = (store, { keyPrefix = "rl", limit = config.rateLimitDefault, windowMs = config.rateLimitWindowMs, onLimitExceeded } = {}) =>
  async (c, next) => {
    const user = c.get("user");
    const apiKeyId = c.get("apiKey")?.id ?? null;
    const resolvedLimit = typeof limit === "function" ? Number(limit(c)) : Number(limit);
    const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit > 0 ? resolvedLimit : config.rateLimitDefault;

    const idPart = apiKeyId ?? user?.id ?? "anon";
    const route = c.req.path;
    const key = `${keyPrefix}:${idPart}:${route}`;

    const now = Date.now();
    let current;
    let ttl;
    let remaining;
    try {
      [current, ttl, remaining] = await store.eval(
        rateLimitScript,
        1,
        key,
        String(now),
        String(windowMs),
        String(safeLimit),
      );
    } catch (error) {
      console.error(`[RateLimit] ${c.req.method} ${route} failed`, error);
      return c.json(
        { error: "Layanan pembatas request sedang bermasalah. Coba lagi beberapa saat." },
        503,
      );
    }
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

