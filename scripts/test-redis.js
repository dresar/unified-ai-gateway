import "dotenv/config";
import { Redis as UpstashRedis } from "@upstash/redis";

const { createRedis } = await import("../server/src/infra/redis.js");
const { config } = await import("../server/src/config.js");

const maskTarget = (value) => {
  if (!value) return "not-configured";
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "configured";
  }
};

const wrapUpstashRest = (client) => ({
  provider: "upstash-rest-direct",
  async connect() {},
  async ping() {
    return client.ping();
  },
  async set(key, value) {
    return client.set(key, value, { ex: 60 });
  },
  async get(key) {
    return client.get(key);
  },
  async del(key) {
    return client.del(key);
  },
  async quit() {},
});

const testRoundTrip = async (client, label) => {
  const key = `redis:test:${label}:${Date.now()}`;
  const value = `ok:${Date.now()}`;

  console.log(`\n[${label}] provider=${client.provider ?? "unknown"}`);

  try {
    if (typeof client.connect === "function") await client.connect();

    if (typeof client.ping === "function") {
      const pong = await client.ping();
      console.log(`[${label}] ping=${pong}`);
    }

    const setResult = await client.set(key, value);
    const getResult = await client.get(key);
    const delResult = await client.del(key);

    console.log(`[${label}] set=${String(setResult)}`);
    console.log(`[${label}] get=${String(getResult)}`);
    console.log(`[${label}] del=${String(delResult)}`);

    if (String(getResult) !== value) {
      throw new Error(`Roundtrip mismatch: expected "${value}" got "${String(getResult)}"`);
    }

    console.log(`[${label}] status=PASS`);
    return true;
  } catch (error) {
    console.error(`[${label}] status=FAIL`);
    console.error(`[${label}] error=${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    if (typeof client.quit === "function") {
      await client.quit().catch(() => {});
    }
  }
};

console.log("[env] REDIS_URL:", maskTarget(config.redisUrl));
console.log("[env] UPSTASH_REDIS_REST_URL:", maskTarget(config.upstashRedisRestUrl));
console.log("[env] REQUIRE_REDIS_IN_PRODUCTION:", String(config.requireRedisInProduction));

const results = [];

const autoClient = createRedis();
results.push(await testRoundTrip(autoClient, "server-auto"));

if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
  const restClient = wrapUpstashRest(new UpstashRedis({
    url: config.upstashRedisRestUrl,
    token: config.upstashRedisRestToken,
    enableTelemetry: false,
  }));
  results.push(await testRoundTrip(restClient, "upstash-rest-direct"));
} else {
  console.log("\n[upstash-rest-direct] skipped: REST env not configured");
}

if (results.every(Boolean)) {
  console.log("\nRedis test selesai: semua pengecekan PASS");
  process.exit(0);
}

console.error("\nRedis test selesai: ada pengecekan yang FAIL");
process.exit(1);
