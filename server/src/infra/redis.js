import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";
import { createMemoryStore } from "./memoryStore.js";
import { config } from "../config.js";

const getOption = (options, names) => {
  for (const name of names) {
    if (options?.[name] != null) return options[name];
  }
  return undefined;
};

const normalizeSetOptions = (options = {}) => {
  if (!options || typeof options !== "object") return {};

  const normalized = {};
  const ex = Number(getOption(options, ["EX", "ex"]));
  const px = Number(getOption(options, ["PX", "px"]));
  const exat = Number(getOption(options, ["EXAT", "exat"]));
  const pxat = Number(getOption(options, ["PXAT", "pxat"]));

  if (Number.isFinite(ex) && ex > 0) normalized.ex = ex;
  if (Number.isFinite(px) && px > 0) normalized.px = px;
  if (Number.isFinite(exat) && exat > 0) normalized.exat = exat;
  if (Number.isFinite(pxat) && pxat > 0) normalized.pxat = pxat;
  if (getOption(options, ["NX", "nx"])) normalized.nx = true;
  if (getOption(options, ["XX", "xx"])) normalized.xx = true;
  if (getOption(options, ["GET", "get"])) normalized.get = true;
  if (getOption(options, ["KEEPTTL", "keepTtl", "keepttl"])) normalized.keepTtl = true;

  return normalized;
};

const toIoredisSetArgs = (options = {}) => {
  const normalized = normalizeSetOptions(options);
  const args = [];

  if (normalized.get) args.push("GET");
  if (normalized.ex != null) args.push("EX", String(normalized.ex));
  if (normalized.px != null) args.push("PX", String(normalized.px));
  if (normalized.exat != null) args.push("EXAT", String(normalized.exat));
  if (normalized.pxat != null) args.push("PXAT", String(normalized.pxat));
  if (normalized.keepTtl) args.push("KEEPTTL");
  if (normalized.nx) args.push("NX");
  if (normalized.xx) args.push("XX");

  return args;
};

const normalizeEvalArgs = (argsOrOpts) => {
  const [first, ...rest] = argsOrOpts;

  if (typeof first === "number") {
    const keyCount = Number(first);
    return {
      keys: rest.slice(0, keyCount),
      args: rest.slice(keyCount),
    };
  }

  if (Array.isArray(first)) {
    return {
      keys: first,
      args: Array.isArray(rest[0]) ? rest[0] : rest,
    };
  }

  if (typeof first === "object" && first !== null) {
    return {
      keys: Array.isArray(first.keys) ? first.keys : [],
      args: Array.isArray(first.arguments) ? first.arguments : [],
    };
  }

  return { keys: [], args: argsOrOpts };
};

const createIoredisAdapter = (client, url) => ({
  isMemoryStore: false,
  provider: url.includes("upstash.io") ? "upstash-tcp" : "redis",
  raw: client,
  async connect() {
    await client.connect();
  },
  async get(key) {
    return client.get(key);
  },
  async mget(...keys) {
    return keys.length > 0 ? client.mget(...keys) : [];
  },
  async set(key, value, options = {}) {
    return client.set(key, value, ...toIoredisSetArgs(options));
  },
  async del(key) {
    return client.del(key);
  },
  async incr(key) {
    return client.incr(key);
  },
  async pexpire(key, ms) {
    return client.pexpire(key, ms);
  },
  async expire(key, seconds) {
    return client.expire(key, seconds);
  },
  async eval(script, ...argsOrOpts) {
    const { keys, args } = normalizeEvalArgs(argsOrOpts);
    return client.eval(script, keys.length, ...keys, ...args);
  },
  async ping() {
    return client.ping();
  },
  async quit() {
    return client.quit();
  },
});

const createUpstashAdapter = (url, token) => {
  const client = new UpstashRedis({
    url,
    token,
    enableTelemetry: false,
  });

  return {
    isMemoryStore: false,
    provider: "upstash-rest",
    raw: client,
    async connect() {},
    async get(key) {
      return client.get(key);
    },
    async mget(...keys) {
      return keys.length > 0 ? client.mget(...keys) : [];
    },
    async set(key, value, options = {}) {
      return client.set(key, value, normalizeSetOptions(options));
    },
    async del(key) {
      return client.del(key);
    },
    async incr(key) {
      return client.incr(key);
    },
    async pexpire(key, ms) {
      return client.pexpire(key, ms);
    },
    async expire(key, seconds) {
      return client.expire(key, seconds);
    },
    async eval(script, ...argsOrOpts) {
      const { keys, args } = normalizeEvalArgs(argsOrOpts);
      return client.eval(script, keys, args);
    },
    async ping() {
      return client.ping();
    },
    async quit() {},
  };
};

/**
 * Production serverless: pakai REDIS_URL (TCP) atau Upstash REST env.
 * Dev / tanpa Redis: pakai in-memory store (state per-worker, tidak shared antar instance).
 */
export const createRedis = () => {
  if (config.redisUrl && config.redisUrl.trim()) {
    const url = config.redisUrl.trim();
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 100, 500),
      tls: url.startsWith("rediss://") ? {} : undefined,
    });
    client.on("error", (err) => console.error("[Redis]", err.message));
    return createIoredisAdapter(client, url);
  }

  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    return createUpstashAdapter(
      config.upstashRedisRestUrl.trim(),
      config.upstashRedisRestToken.trim(),
    );
  }

  return createMemoryStore();
};
