/**
 * In-memory store dengan API mirip Redis. Dipakai kalau tidak pakai Redis.
 * get, set, del, incr, pexpire, expire, eval (untuk rate limit), ping, connect.
 */
const store = new Map();
const expiry = new Map();
const numeric = new Map();

function getExpiry(key) {
  const t = expiry.get(key);
  if (t != null && t <= Date.now()) {
    store.delete(key);
    expiry.delete(key);
    numeric.delete(key);
    return undefined;
  }
  return t;
}

export function createMemoryStore() {
  return {
    isMemoryStore: true,
    provider: "memory",
    async connect() {},
    async get(key) {
      getExpiry(key);
      const v = store.get(key);
      return v ?? null;
    },
    async mget(...keys) {
      return keys.map((key) => {
        getExpiry(key);
        return store.get(key) ?? null;
      });
    },
    async set(key, value, opts = {}) {
      if (opts.NX && store.has(key)) {
        getExpiry(key);
        if (store.has(key)) return null;
      }
      store.set(key, value);
      if (opts.PX != null) expiry.set(key, Date.now() + opts.PX);
      else if (opts.EX != null) expiry.set(key, Date.now() + opts.EX * 1000);
      return "OK";
    },
    async del(key) {
      store.delete(key);
      expiry.delete(key);
      numeric.delete(key);
      return 1;
    },
    async incr(key) {
      getExpiry(key);
      let cur = numeric.get(key);
      if (cur === undefined) {
        const raw = store.get(key);
        cur = typeof raw === "string" ? parseInt(raw, 10) : 0;
        if (!Number.isFinite(cur)) cur = 0;
      }
      const n = cur + 1;
      numeric.set(key, n);
      store.set(key, String(n));
      return n;
    },
    async pexpire(key, ms) {
      if (!store.has(key)) return 0;
      expiry.set(key, Date.now() + ms);
      return 1;
    },
    async expire(key, seconds) {
      if (!store.has(key)) return 0;
      expiry.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    async eval(script, opts) {
      const key = opts?.keys?.[0];
      const args = opts?.arguments ?? [];
      const windowMs = Number(args[1]) || 60000;
      const limit = Number(args[2]) || 1000;
      if (!key) return [0, 0, limit];
      const current = await this.incr(key);
      if (current === 1) expiry.set(key, Date.now() + windowMs);
      const exp = expiry.get(key);
      const ttl = exp != null ? Math.max(0, exp - Date.now()) : 0;
      const remaining = Math.max(0, limit - current);
      return [current, ttl, remaining];
    },
    async ping() {
      return "PONG";
    },
    async quit() {},
  };
}
