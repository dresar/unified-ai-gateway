import { Pool } from "pg";
import { config } from "../config.js";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalDbHost(hostname = "") {
  const normalized = String(hostname).trim().toLowerCase();
  return LOCAL_DB_HOSTS.has(normalized) || normalized.endsWith(".local");
}

/** Untuk Neon: pakai verify penuh dan sslmode=verify-full agar tidak warning pg v9. */
function getDbConfig() {
  let url = config.databaseUrl || "";
  if (!url) return { connectionString: "", ssl: undefined };

  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    return { connectionString: url, ssl: undefined };
  }

  const hostname = parsed.hostname?.toLowerCase() ?? "";
  const sslMode = parsed.searchParams.get("sslmode");
  let ssl = undefined;
  const shouldUseSsl = hostname.includes("neon.tech")
    || sslMode === "require"
    || sslMode === "verify-full"
    || ((config.isProduction || config.isServerless) && !isLocalDbHost(hostname) && sslMode !== "disable");

  if (hostname.includes("neon.tech")) {
    ssl = { rejectUnauthorized: true };
    parsed.searchParams.set("sslmode", "verify-full");
  } else if (shouldUseSsl) {
    ssl = { rejectUnauthorized: true };
    if (!sslMode) parsed.searchParams.set("sslmode", "require");
  }

  url = parsed.toString();
  return { connectionString: url, ssl };
}

export const createPool = (max) => {
  const { connectionString, ssl } = getDbConfig();
  return new Pool({
    connectionString,
    ssl,
    max,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
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

