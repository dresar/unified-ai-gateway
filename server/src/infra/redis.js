import Redis from "ioredis";
import { createMemoryStore } from "./memoryStore.js";
import { config } from "../config.js";

/**
 * Production serverless: pakai Redis jika REDIS_URL diset (Upstash/dll).
 * Dev / tanpa Redis: pakai in-memory store (state per-worker, tidak shared antar instance).
 */
export const createRedis = () => {
  if (config.redisUrl && config.redisUrl.trim()) {
    const url = config.redisUrl.trim();
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 100, 500),
      tls: url.startsWith("rediss://") ? {} : undefined,
    });
    redis.isMemoryStore = false;
    redis.provider = url.includes("upstash.io") ? "upstash" : "redis";
    redis.on("error", (err) => console.error("[Redis]", err.message));
    return redis;
  }
  return createMemoryStore();
};
