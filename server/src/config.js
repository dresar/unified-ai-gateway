const parseBoolean = (value, fallback = false) => {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const appMode = (process.env.MODE ?? process.env.NODE_ENV ?? "development").trim().toLowerCase();
const isProduction = process.env.NODE_ENV === "production" || appMode === "production";
const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.RUNTIME === "serverless"
);

const parseOrigins = () => {
  const raw = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "";
  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origins.length > 0) return Array.from(new Set(origins));
  if (isProduction) return [];

  return [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
};

export const config = {
  mode: appMode,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? "8787"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  hmacMaxSkewMs: Number(process.env.HMAC_MAX_SKEW_MS ?? "30000"),
  nonceTtlSeconds: Number(process.env.NONCE_TTL_SECONDS ?? "30"),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
  rateLimitDefault: Number(process.env.RATE_LIMIT_DEFAULT ?? "1000"),
  apiKeyGraceMs: Number(process.env.API_KEY_GRACE_MS ?? "60000"),
  breakerTimeoutMs: Number(process.env.BREAKER_TIMEOUT_MS ?? "500"),
  breakerHalfOpenAfterMs: Number(process.env.BREAKER_HALF_OPEN_AFTER_MS ?? "500"),
  maxUploadBytes: parseNumber(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
  maxProxyBodyBytes: parseNumber(process.env.MAX_PROXY_BODY_BYTES, 2 * 1024 * 1024),
  upstreams: [],
  corsOrigins: parseOrigins(),
  enableDevLogin: parseBoolean(process.env.ENABLE_DEV_LOGIN, !isProduction),
  enableInternalTestRoutes: parseBoolean(process.env.ENABLE_INTERNAL_TEST_ROUTES, !isProduction),
  exposeMetrics: parseBoolean(process.env.EXPOSE_METRICS, !isProduction && !isServerless),
  exposeOpenApi: parseBoolean(process.env.EXPOSE_OPENAPI, !isProduction),
  allowCredentialExport: parseBoolean(process.env.ALLOW_CREDENTIAL_EXPORT, !isProduction),
  enableSelfRegistration: parseBoolean(process.env.ENABLE_SELF_REGISTRATION, !isProduction),
  enableRuntimeMigrations: parseBoolean(process.env.ENABLE_RUNTIME_MIGRATIONS, !isProduction),
  requireRedisInProduction: parseBoolean(process.env.REQUIRE_REDIS_IN_PRODUCTION, true),
  /** Map provider -> base URL. Dipakai gateway untuk proxy. Tidak pakai .env (hardcode). */
  providerUpstreams: {
    gemini: "https://generativelanguage.googleapis.com",
    groq: "https://api.groq.com/openai/v1",
    apify: "https://api.apify.com/v2",
    cloudinary: "https://api.cloudinary.com",
    imagekit: "https://api.imagekit.io",
  },
  isServerless,
  dbMaxPool: Number(
    process.env.DB_MAX_POOL ??
    (isServerless ? "2" : "10")
  ),
  isProduction,
};

const PLACEHOLDER_PASSWORD = "REPLACE_WITH_REAL_PASSWORD";

export const assertConfig = () => {
  if (!config.databaseUrl) throw new Error("DATABASE_URL wajib di-set di file .env");
  if (config.databaseUrl.includes(PLACEHOLDER_PASSWORD)) {
    throw new Error(
      "DATABASE_URL masih pakai password placeholder.\n" +
      "1. Buka https://console.neon.tech\n" +
      "2. Pilih project → Connection string (atau Settings → Reset password)\n" +
      "3. Copy connection string dan ganti di .env: DATABASE_URL=postgresql://...\n" +
      "   Untuk Neon, tambahkan di akhir URL: &sslmode=verify-full (supaya tidak dapat warning SSL dari pg v9)."
    );
  }
  if (!config.jwtSecret) throw new Error("JWT_SECRET wajib di-set");
  if (config.isProduction && config.requireRedisInProduction && !config.redisUrl) {
    throw new Error("REDIS_URL wajib di-set untuk production ketika REQUIRE_REDIS_IN_PRODUCTION=true");
  }
};
