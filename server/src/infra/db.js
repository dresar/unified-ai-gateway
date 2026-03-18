import { Pool } from "pg";
import { config } from "../config.js";

/** Untuk Neon: pakai verify penuh dan sslmode=verify-full agar tidak warning pg v9. */
function getDbConfig() {
  let url = config.databaseUrl || "";
  if (!url) return { connectionString: "", ssl: undefined };

  let ssl = undefined;
  if (url.includes("neon.tech")) {
    ssl = { rejectUnauthorized: true };
    if (url.includes("sslmode=require") && !url.includes("sslmode=verify-full")) {
      url = url.replace(/sslmode=require/g, "sslmode=verify-full");
    }
  } else if (url.includes("sslmode=require") || url.includes("sslmode=verify-full")) {
    ssl = { rejectUnauthorized: true };
  }

  return { connectionString: url, ssl };
}

export const createPool = (max) => {
  const { connectionString, ssl } = getDbConfig();
  return new Pool({
    connectionString,
    ssl,
    max,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    keepAlive: true,
  });
};

export class PoolManager {
  #pool;
  #max;
  #lastResizeAt = 0;

  constructor({ initialMax = 10 } = {}) {
    this.#max = initialMax;
    this.#pool = createPool(this.#max);
  }

  get pool() {
    return this.#pool;
  }

  async query(text, params) {
    return this.#pool.query(text, params);
  }

  /** Ambil client dari pool untuk transaksi (begin/commit/rollback). */
  connect() {
    return this.#pool.connect();
  }

  async end() {
    await this.#pool.end();
  }

  async resizeIfNeeded({ pendingWaitMs, targetMax }) {
    const now = Date.now();
    if (now - this.#lastResizeAt < 5000) return;
    if (!Number.isFinite(targetMax) || targetMax <= 0 || targetMax === this.#max) return;
    if (pendingWaitMs < 5 && targetMax < this.#max) return;

    this.#lastResizeAt = now;
    const oldPool = this.#pool;
    this.#max = targetMax;
    this.#pool = createPool(this.#max);
    oldPool.end().catch(() => {});
  }
}

