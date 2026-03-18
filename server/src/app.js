import { randomBytes, createHash } from "node:crypto";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import bcrypt from "bcryptjs";
import { config, assertConfig } from "./config.js";
import { signJwt } from "./security/jwt.js";
import { jwtAuth } from "./middleware/jwtAuth.js";
import { hmacAuth } from "./middleware/hmacAuth.js";
import { loadHmacSecret } from "./middleware/loadHmacSecret.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { L1Cache } from "./cache/l1.js";
import { L2Cache } from "./cache/l2.js";
import { PoolManager } from "./infra/db.js";
import { createRedis } from "./infra/redis.js";
import { createWsHub } from "./infra/ws.js";
import { register, httpRequestDurationMs, apiKeyRotations } from "./infra/metrics.js";
import { ConsistentHashRing } from "./lib/consistentHash.js";
import { CircuitBreaker } from "./lib/circuitBreaker.js";
import { ensureApiKeySchema, createApiKey, listApiKeys, rotateApiKey } from "./services/apiKeys.js";
import { ensureAiModelsSchema, listModels, createModel, deleteModelById, updateModel } from "./services/aiModels.js";
import { getApifyTokenFromCredential, normalizeApifyCollection, normalizeApifyRun, normalizeApifySmoke } from "./services/apifyTest.js";
import {
  acknowledgeAlert,
  createAlert,
  ensureObservabilitySchema,
  getApiKeyAnalytics,
  getMonitoringOverview,
  getProviderAvailability,
  listGatewayAlerts,
  listGatewayLogs,
  logGatewayRequest,
  reactivateExpiredCredentialCooldowns,
} from "./services/observability.js";
import { chatWithProvider, uploadToCloud, deleteFromCloud } from "./services/playground.js";
import { runMigrations } from "./infra/runMigrations.js";

const resolveCorsOrigin = (origin) => {
  if (!origin) return null;
  return config.corsOrigins.includes(origin) ? origin : null;
};

const hasBody = (method) => !["GET", "HEAD"].includes(String(method).toUpperCase());
const canonicalizeSearch = (urlString) => {
  const entries = Array.from(new URL(urlString).searchParams.entries())
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
    );
  return new URLSearchParams(entries).toString();
};
const hashCacheSuffix = (value) => createHash("sha256").update(value).digest("hex").slice(0, 24);

export const createServerContext = async () => {
  assertConfig();

  const db = new PoolManager({ initialMax: config.dbMaxPool });
  if (config.enableRuntimeMigrations) {
    await runMigrations(db);
    await ensureApiKeySchema(db);
    await ensureObservabilitySchema(db);
    await ensureAiModelsSchema(db);
  }

  const redis = createRedis();
  if (typeof redis.connect === "function") await redis.connect();

  const l1 = new L1Cache();
  const l2 = new L2Cache(redis);
  const ws = createWsHub();

  const ring = new ConsistentHashRing(config.upstreams, { replicas: 200 });
  const breaker = new CircuitBreaker();
  const providerUpstreams = config.providerUpstreams;

  const health = {
    ok: true,
    checkedAt: Date.now(),
    dbOk: true,
    redisOk: true,
    redisMode: redis.isMemoryStore ? "memory" : "redis",
    redisProvider: redis.provider ?? (redis.isMemoryStore ? "memory" : "redis"),
    redisRequired: config.isProduction ? config.requireRedisInProduction : false,
    sharedStateOk: !redis.isMemoryStore || !config.isProduction,
    runtimeMigrationsEnabled: config.enableRuntimeMigrations,
  };
  const refreshHealth = async () => {
    try {
      await db.query("select 1 as ok");
      health.dbOk = true;
    } catch {
      health.dbOk = false;
    }
    try {
      await redis.ping();
      health.redisOk = true;
    } catch {
      health.redisOk = false;
    }
    health.sharedStateOk = !redis.isMemoryStore || !config.isProduction || !config.requireRedisInProduction;
    health.ok = health.dbOk && health.redisOk && health.sharedStateOk;
    health.checkedAt = Date.now();
  };
  
  // Jangan jalankan interval di serverless (Vercel/Lambda) — bikin freeze / billing.
  let healthTimer = null;
  if (!config.isServerless) {
    healthTimer = setInterval(() => refreshHealth().catch(() => {}), 5000);
    healthTimer.unref?.();
  }
  if (!config.isServerless) {
    await refreshHealth();
  } else {
    health.checkedAt = Date.now();
  }

  const shutdown = async () => {
    if (healthTimer) clearInterval(healthTimer);
    await Promise.allSettled([
      db.end?.(),
      redis.quit?.(),
    ]);
  };

  return { db, redis, l1, l2, ws, ring, breaker, providerUpstreams, health, refreshHealth, shutdown };
};

export const createApp = (ctx) => {
  const app = new OpenAPIHono();
  const authRateLimit = rateLimit(ctx.redis, {
    keyPrefix: "auth",
    limit: 10,
    windowMs: 60_000,
  });

  // CORS dibatasi ke origin yang eksplisit agar dashboard production tidak terbuka lintas-origin.
  app.use("*", cors({
    origin: (origin) => resolveCorsOrigin(origin) ?? "",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  }));

  app.onError((err, c) => {
    if (err?.name === "ZodError") {
      return c.json({ error: "Permintaan tidak valid." }, 400);
    }
    console.error("Unhandled application error", err);
    return c.json({ error: "Terjadi kesalahan pada server." }, 500);
  });

  app.notFound((c) => c.json({ error: "Rute tidak ditemukan." }, 404));

  app.use("*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "1; mode=block");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
  });

  app.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    const ms = performance.now() - start;
    const route = c.req.routePath ?? c.req.path;
    httpRequestDurationMs.observe({ method: c.req.method, route, status: String(c.res.status) }, ms);
  });

  app.get("/ping", (c) => c.json({ ok: true }, 200));

  app.get(
    "/healthz",
    async (c) => {
      if (config.isServerless && typeof ctx.refreshHealth === "function") {
        await ctx.refreshHealth().catch(() => {});
      }
      return c.json({ ...ctx.health }, ctx.health.ok ? 200 : 503);
    },
  );

  app.get("/metrics", async (c) => {
    if (!config.exposeMetrics || config.isServerless) return c.json({ error: "Not found" }, 404);
    c.header("Content-Type", register.contentType);
    return c.body(await register.metrics());
  });

  if (config.exposeOpenApi) {
    app.doc("/openapi.json", {
      openapi: "3.1.0",
      info: { title: "Unified AI Gateway API", version: "1.0.0" },
    });
  }

  const AuthBody = z.object({ email: z.string().email(), password: z.string().min(8) });
  app.use("/api/auth/login", authRateLimit);
  app.use("/api/auth/register", authRateLimit);

  if (config.enableDevLogin) {
    app.use("/api/auth/dev-login", authRateLimit);
    app.post("/api/auth/dev-login", async (c) => {
      let email = "admin@example.com";
      let password = "password123";
      try {
        const body = await c.req.json().catch(() => ({}));
        if (body?.email) email = String(body.email).trim().toLowerCase();
        if (body?.password) password = String(body.password);
      } catch {}

      const { rows } = await ctx.db.query(
        "select id, email, display_name, password_hash, hmac_secret from public.users where email = $1 limit 1",
        [email]
      );
      const user = rows[0];
      if (!user) return c.json({ error: "User tidak ditemukan. Jalankan: npm run seed" }, 404);

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return c.json({ error: "Kredensial tidak valid." }, 401);

      const token = await signJwt({ sub: user.id, email: user.email, displayName: user.display_name ?? null });
      return c.json({
        token,
        user: { id: user.id, email: user.email, displayName: user.display_name ?? null },
      });
    });
  }

  app.openapi(
    {
      method: "post",
      path: "/api/auth/register",
      request: { body: { content: { "application/json": { schema: AuthBody } } } },
      responses: { 200: { description: "OK" } },
    },
    async (c) => {
      if (!config.enableSelfRegistration) {
        return c.json({ error: "Pendaftaran mandiri tidak tersedia." }, 403);
      }
      const { email, password } = c.req.valid("json");
      const passwordHash = await bcrypt.hash(password, 10);

      try {
        const hmacSecret = randomBytes(32).toString("hex");
        const { rows } = await ctx.db.query(
          "insert into public.users (email, password_hash, hmac_secret) values ($1, $2, $3) returning id, email, display_name, hmac_secret",
          [email.trim().toLowerCase(), passwordHash, hmacSecret],
        );
        const user = rows[0];
        const token = await signJwt({ sub: user.id, email: user.email, displayName: user.display_name ?? null });
        return c.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name ?? null } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("duplicate")) return c.json({ error: "Email sudah terdaftar" }, 409);
        return c.json({ error: "Gagal membuat user" }, 500);
      }
    },
  );

  app.openapi(
    {
      method: "post",
      path: "/api/auth/login",
      request: { body: { content: { "application/json": { schema: AuthBody } } } },
      responses: { 200: { description: "OK" } },
    },
    async (c) => {
      try {
        const { email, password } = c.req.valid("json");
        const normalizedEmail = email.trim().toLowerCase();
        const { rows } = await ctx.db.query(
          "select id, email, display_name, password_hash, hmac_secret from public.users where email = $1 limit 1",
          [normalizedEmail],
        );
        const user = rows[0];
        if (!user) return c.json({ error: "Email atau password salah." }, 401);
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return c.json({ error: "Email atau password salah." }, 401);
        const token = await signJwt({ sub: user.id, email: user.email, displayName: user.display_name ?? null });
        return c.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name ?? null } });
      } catch (error) {
        console.error("[Auth] login failed", error);
        return c.json(
          { error: "Login gagal karena layanan server sedang bermasalah." },
          503,
        );
      }
    },
  );

  const protectedApi = new OpenAPIHono();
  protectedApi.use("*", jwtAuth());
  protectedApi.use("*", rateLimit(ctx.redis));
  // HMAC hanya untuk gateway (API key); dashboard cukup JWT

  protectedApi.get("/api/auth/me", (c) => c.json(c.get("user")));

  protectedApi.patch("/api/profile", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const display_name = body?.displayName ?? body?.display_name;
    const email = body?.email?.trim?.()?.toLowerCase?.();
    if (display_name !== undefined) {
      await ctx.db.query("update public.users set display_name = $1 where id = $2", [display_name, user.id]);
    }
    if (email && email !== user.email) {
      const { rows } = await ctx.db.query("select id from public.users where email = $1 and id != $2", [email, user.id]);
      if (rows.length > 0) return c.json({ error: "Email sudah dipakai" }, 409);
      await ctx.db.query("update public.users set email = $1 where id = $2", [email, user.id]);
    }
    const { rows } = await ctx.db.query("select id, email, display_name from public.users where id = $1", [user.id]);
    const u = rows[0];
    return c.json({ id: u.id, email: u.email, displayName: u.display_name ?? null });
  });

  protectedApi.post("/api/auth/change-password", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const current = body?.current_password ?? body?.currentPassword;
    const nextPass = body?.new_password ?? body?.newPassword;
    if (!current || !nextPass) return c.json({ error: "current_password dan new_password wajib" }, 400);
    if (nextPass.length < 8) return c.json({ error: "Password baru minimal 8 karakter" }, 400);
    const { rows } = await ctx.db.query("select password_hash from public.users where id = $1", [user.id]);
    const ok = await bcrypt.compare(current, rows[0]?.password_hash ?? "");
    if (!ok) return c.json({ error: "Password lama salah" }, 401);
    const hash = await bcrypt.hash(nextPass, 10);
    await ctx.db.query("update public.users set password_hash = $1 where id = $2", [hash, user.id]);
    return c.json({ success: true });
  });

  protectedApi.openapi(
    {
      method: "get",
      path: "/api/keys",
      responses: { 200: { description: "OK" } },
    },
    async (c) => {
      const user = c.get("user");
      const keys = await listApiKeys(ctx.db, { tenantId: user.id });
      return c.json(keys);
    },
  );

  protectedApi.openapi(
    {
      method: "post",
      path: "/api/keys",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                quota_per_minute: z.number().int().min(1).max(100000).optional(),
                allowed_providers: z.array(z.string()).optional(),
                name: z.string().optional(),
                client_username: z.string().optional(),
                client_password: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const created = await createApiKey(ctx.db, {
        tenantId: user.id,
        quotaPerMinute: body.quota_per_minute,
        allowedProviders: body.allowed_providers,
        name: body.name,
        clientUsername: body.client_username,
        clientPassword: body.client_password,
      });
      ctx.ws.broadcastToTenant?.(user.id, { type: "api_key.created", at: Date.now(), tenantId: user.id, apiKeyId: created.id });
      return c.json(created);
    },
  );

  protectedApi.openapi(
    {
      method: "post",
      path: "/api/keys/{id}/rotate",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: { 200: { description: "OK" } },
    },
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.valid("param");
      
      const { rows } = await ctx.db.query("select key_hash from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
      const oldKeyHash = rows[0]?.key_hash;

      const rotated = await rotateApiKey({ db: ctx.db, l1: ctx.l1, l2: ctx.l2, redis: ctx.redis }, { apiKeyId: id, tenantId: user.id, oldKeyHash });
      apiKeyRotations.inc({ tenant_id: user.id });
      ctx.ws.broadcastToTenant?.(user.id, { type: "api_key.rotated", at: Date.now(), tenantId: user.id, oldApiKeyId: id, newApiKeyId: rotated.id });
      return c.json(rotated);
    },
  );

  protectedApi.get("/api/keys/:id/health", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const key = `health:${user.id}:${id}`;
    const data = await ctx.l2.getJson(key);
    return c.json({ id, ...(data ?? {}) });
  });

  protectedApi.patch("/api/keys/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.name === "string") {
      await ctx.db.query("update public.api_keys set name = $1, updated_at = now() where id = $2 and tenant_id = $3", [body.name.trim() || null, id, user.id]);
    }
    const { rows } = await ctx.db.query("select id, tenant_id, status, quota_per_minute, allowed_providers, name, created_at from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
    return c.json(rows[0] ?? {});
  });

  protectedApi.delete("/api/keys/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    await ctx.db.query("delete from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
    return c.body(null, 204);
  });

  protectedApi.get("/api/keys/:id/stats", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { rows: owner } = await ctx.db.query("select 1 from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
    if (!owner.length) return c.json({ error: "Not found" }, 404);
    const days = 7;
    const { rows } = await ctx.db.query(
      `select date_trunc('day', created_at at time zone 'UTC')::date as day, count(*)::int as requests, count(*) filter (where status_code >= 400)::int as errors
       from public.gateway_request_logs where api_key_id = $1 and created_at >= now() - interval '1 day' * $2
       group by 1 order by 1`,
      [id, days]
    );
    const daily = rows.map((r) => ({ date: r.day, requests: r.requests, errors: r.errors }));
    return c.json({ daily });
  });

  protectedApi.get("/api/keys/:id/analytics", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { rows: owner } = await ctx.db.query("select 1 from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
    if (!owner.length) return c.json({ error: "Not found" }, 404);
    const analytics = await getApiKeyAnalytics(ctx.db, { tenantId: user.id, apiKeyId: id });
    return c.json(analytics);
  });

  protectedApi.get("/api/keys/:id/domains", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { rows: owner } = await ctx.db.query("select 1 from public.api_keys where id = $1 and tenant_id = $2", [id, user.id]);
    if (!owner.length) return c.json({ error: "Not found" }, 404);
    const { rows } = await ctx.db.query(
      "select distinct origin_domain as domain from public.gateway_request_logs where api_key_id = $1 and origin_domain is not null order by 1",
      [id]
    );
    return c.json({ domains: rows.map((r) => r.domain) });
  });

  protectedApi.get("/api/dashboard/keys", async (c) => {
    const user = c.get("user");
    const keys = await listApiKeys(ctx.db, { tenantId: user.id });
    const healthKeys = keys.map((k) => `health:${user.id}:${k.id}`);
    const healthRows = await ctx.l2.mgetJson(healthKeys);
    const enriched = keys.map((k, index) => {
      const health = healthRows[index] ?? null;
      return { ...k, health, remaining: health?.remaining ?? null };
    });
    return c.json(enriched);
  });

  protectedApi.get("/api/stats", async (c) => {
    const user = c.get("user");
    const uid = user.id;
    const [creds, clients, requests, alerts] = await Promise.all([
      ctx.db.query(
        "select status, total_requests from public.provider_credentials where user_id = $1",
        [uid]
      ),
      ctx.db.query("select count(*)::int as n from public.api_clients where user_id = $1", [uid]),
      ctx.db.query(
        "select count(*)::int as total, count(*) filter (where status_code >= 400 and created_at > now() - interval '24 hours')::int as errors from public.gateway_request_logs where tenant_id = $1",
        [uid]
      ),
      ctx.db.query(
        "select count(*) filter (where status = 'active')::int as active from public.gateway_alerts where tenant_id = $1",
        [uid]
      )
    ]);
    const totalCredentials = creds.rows.length;
    const activeCredentials = creds.rows.filter((r) => r.status === "active").length;
    const cooldownCredentials = creds.rows.filter((r) => r.status === "cooldown").length;
    const totalRequests = creds.rows.reduce((s, r) => s + (Number(r.total_requests) || 0), 0);
    return c.json({
      totalCredentials,
      activeCredentials,
      cooldownCredentials,
      totalClients: clients.rows[0]?.n ?? 0,
      totalRequests,
      recentErrors: requests.rows[0]?.errors ?? 0,
      activeAlerts: alerts.rows[0]?.active ?? 0,
    });
  });

  protectedApi.get("/api/stats/usage", async (c) => {
    const user = c.get("user");
    const days = 7;
    const { rows } = await ctx.db.query(
      `select date_trunc('day', created_at at time zone 'UTC')::date as date,
              count(*)::int as requests,
              count(*) filter (where status_code >= 400)::int as errors
       from public.gateway_request_logs
       where tenant_id = $1 and created_at >= now() - interval '1 day' * $2
       group by 1 order by 1`,
      [user.id, days]
    );
    return c.json({ daily: rows });
  });

  protectedApi.get("/api/monitoring/overview", async (c) => {
    const user = c.get("user");
    const overview = await getMonitoringOverview(ctx.db, { tenantId: user.id });
    return c.json(overview);
  });

  protectedApi.get("/api/logs", async (c) => {
    const user = c.get("user");
    const rows = await listGatewayLogs(ctx.db, {
      tenantId: user.id,
      limit: c.req.query("limit"),
      provider: c.req.query("provider"),
      apiKeyId: c.req.query("apiKeyId"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    });
    return c.json(rows);
  });

  protectedApi.get("/api/alerts", async (c) => {
    const user = c.get("user");
    const alerts = await listGatewayAlerts(ctx.db, {
      tenantId: user.id,
      status: c.req.query("status") ?? "active",
      limit: c.req.query("limit") ?? 25,
    });
    return c.json(alerts);
  });

  protectedApi.patch("/api/alerts/:id/ack", async (c) => {
    const user = c.get("user");
    const alert = await acknowledgeAlert(ctx.db, { tenantId: user.id, id: c.req.param("id") });
    if (!alert) return c.json({ error: "Not found" }, 404);
    return c.json(alert);
  });

  protectedApi.get("/api/credentials", async (c) => {
    const user = c.get("user");
    const { rows } = await ctx.db.query(
      "select id, provider_name, provider_type, label, status, total_requests, failed_requests, cooldown_until, created_at from public.provider_credentials where user_id = $1 order by created_at desc",
      [user.id]
    );
    return c.json(rows);
  });

  protectedApi.get("/api/credentials/export", async (c) => {
    if (!config.allowCredentialExport) {
      return c.json({ error: "Ekspor credential dinonaktifkan di environment ini." }, 403);
    }
    const user = c.get("user");
    const { rows } = await ctx.db.query(
      "select id, provider_name, provider_type, label, credentials, status, total_requests, failed_requests, cooldown_until, created_at from public.provider_credentials where user_id = $1 order by created_at desc",
      [user.id]
    );
    const items = rows.map((r) => ({
      provider_name: r.provider_name,
      provider_type: r.provider_type,
      label: r.label,
      credentials: typeof r.credentials === "object" ? r.credentials : (r.credentials ? JSON.parse(r.credentials) : {}),
      status: r.status,
    }));
    return c.json(items);
  });

  protectedApi.post("/api/credentials", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const { provider_name, provider_type, label, credentials } = body;
    const { rows } = await ctx.db.query(
      "insert into public.provider_credentials (user_id, provider_name, provider_type, label, credentials) values ($1, $2, $3, $4, $5) returning id, provider_name, provider_type, label, status, total_requests, failed_requests, cooldown_until, created_at",
      [user.id, provider_name ?? "", provider_type ?? "ai", label ?? null, JSON.stringify(credentials ?? {})]
    );
    return c.json(rows[0]);
  });

  protectedApi.get("/api/credentials/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { rows } = await ctx.db.query(
      "select id, provider_name, provider_type, label, credentials, status, total_requests, failed_requests, cooldown_until, created_at from public.provider_credentials where id = $1 and user_id = $2 limit 1",
      [id, user.id]
    );
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json(rows[0]);
  });

  protectedApi.patch("/api/credentials/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    const label = body?.label !== undefined ? body.label : undefined;
    const credentials = body?.credentials;
    if (label !== undefined) {
      await ctx.db.query("update public.provider_credentials set label = $1 where id = $2 and user_id = $3", [label, id, user.id]);
    }
    if (credentials != null && typeof credentials === "object") {
      await ctx.db.query("update public.provider_credentials set credentials = $1 where id = $2 and user_id = $3", [JSON.stringify(credentials), id, user.id]);
    }
    const { rows } = await ctx.db.query(
      "select id, provider_name, provider_type, label, status, total_requests, failed_requests, cooldown_until, created_at from public.provider_credentials where id = $1 and user_id = $2",
      [id, user.id]
    );
    return c.json(rows[0] ?? {});
  });

  protectedApi.delete("/api/credentials/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    await ctx.db.query("delete from public.provider_credentials where id = $1 and user_id = $2", [id, user.id]);
    return c.body(null, 204);
  });

  protectedApi.post("/api/credentials/:id/reactivate", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    await ctx.db.query(
      "update public.provider_credentials set status = 'active', cooldown_until = null where id = $1 and user_id = $2",
      [id, user.id]
    );
    return c.body(null, 204);
  });

  protectedApi.post("/api/credentials/import", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    for (const it of items) {
      const provider_name = it?.provider_name ?? it?.providerName ?? "";
      const provider_type = it?.provider_type ?? it?.providerType ?? "ai";
      const label = it?.label ?? null;
      const credentials = it?.credentials ?? it?.creds ?? {};
      if (!provider_name) continue;
      await ctx.db.query(
        "insert into public.provider_credentials (user_id, provider_name, provider_type, label, credentials) values ($1, $2, $3, $4, $5)",
        [user.id, provider_name, provider_type, label, JSON.stringify(credentials)]
      );
    }
    return c.json({ imported: items.length });
  });

  protectedApi.get("/api/clients", async (c) => {
    const user = c.get("user");
    const { rows } = await ctx.db.query(
      "select id, name, api_key, is_active, rate_limit, allowed_providers, created_at from public.api_clients where user_id = $1 order by created_at desc",
      [user.id]
    );
    return c.json(rows);
  });

  protectedApi.post("/api/clients", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const name = body?.name ?? "Unnamed";
    const rate_limit = Number(body?.rate_limit) || 100;
    const raw = body?.allowed_providers;
    const allowed_providers = Array.isArray(raw) ? raw.filter((p) => typeof p === "string").map((p) => p.trim().toLowerCase()).filter(Boolean) : [];
    const { rows } = await ctx.db.query(
      "insert into public.api_clients (user_id, name, rate_limit, allowed_providers) values ($1, $2, $3, $4) returning id, name, api_key, is_active, rate_limit, allowed_providers, created_at",
      [user.id, name, rate_limit, allowed_providers.length ? allowed_providers : []]
    );
    return c.json(rows[0]);
  });

  protectedApi.patch("/api/clients/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    if (typeof body?.is_active === "boolean") {
      await ctx.db.query("update public.api_clients set is_active = $1 where id = $2 and user_id = $3", [body.is_active, id, user.id]);
    }
    const raw = body?.allowed_providers;
    if (Array.isArray(raw)) {
      const allowed_providers = raw.filter((p) => typeof p === "string").map((p) => p.trim().toLowerCase()).filter(Boolean);
      await ctx.db.query("update public.api_clients set allowed_providers = $1 where id = $2 and user_id = $3", [allowed_providers, id, user.id]);
    }
    const { rows } = await ctx.db.query("select id, name, api_key, is_active, rate_limit, allowed_providers, created_at from public.api_clients where id = $1 and user_id = $2", [id, user.id]);
    return c.json(rows[0] ?? {});
  });

  protectedApi.delete("/api/clients/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    await ctx.db.query("delete from public.api_clients where id = $1 and user_id = $2", [id, user.id]);
    return c.body(null, 204);
  });

  protectedApi.get("/api/playground/models", async (c) => {
    const provider = c.req.query("provider");
    if (!provider || !["gemini", "groq"].includes(provider)) return c.json({ error: "provider required (gemini or groq)" }, 400);
    const models = await listModels(ctx.db, provider);
    return c.json({ models });
  });

  protectedApi.post("/api/playground/models", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const provider = body.provider;
    const model_id = body.model_id ?? body.modelId;
    const display_name = body.display_name ?? body.displayName;
    const supports_vision = body.supports_vision ?? body.supportsVision;
    const is_default = body.is_default ?? body.isDefault;
    const sort_order = body.sort_order ?? body.sortOrder;

    if (!provider || !model_id) {
      return c.json({ error: "provider dan model_id wajib" }, 400);
    }

    try {
      const created = await createModel(ctx.db, {
        provider,
        model_id,
        display_name,
        is_default,
        supports_vision,
        sort_order,
      });
      return c.json(created, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  protectedApi.delete("/api/playground/models/:id", async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: "id required" }, 400);
    try {
      await deleteModelById(ctx.db, id);
      return c.body(null, 204);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  protectedApi.patch("/api/playground/models/:id", async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: "id required" }, 400);
    const body = await c.req.json().catch(() => ({}));
    const payload = {
      display_name: body.display_name ?? body.displayName,
      supports_vision: body.supports_vision ?? body.supportsVision,
      is_default: body.is_default ?? body.isDefault,
    };
    try {
      const updated = await updateModel(ctx.db, id, payload);
      if (!updated) return c.json({ error: "Not found" }, 404);
      return c.json(updated, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  protectedApi.post("/api/playground/chat", async (c) => {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const credentialId = body.credential_id ?? body.credentialId;
    const prompt = body.prompt ?? "";
    const imageBase64 = body.image_base64 ?? body.imageBase64 ?? "";
    const modelId = typeof body.model_id === "string" && body.model_id.trim() ? body.model_id.trim() : null;
    if (!credentialId) return c.json({ error: "credential_id required" }, 400);
    const result = await chatWithProvider({ db: ctx.db }, { userId: user.id, credentialId, prompt, imageBase64, modelId });
    if (result.error) return c.json({ error: result.error }, 400);
    return c.json(result);
  });

  protectedApi.post("/api/playground/upload", async (c) => {
    const user = c.get("user");
    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ error: "Form data required" }, 400);
    const file = formData.get("file");
    const credentialId = formData.get("credential_id") ?? formData.get("credentialId");
    const provider = formData.get("provider") ?? "cloudinary";
    if (!file || !credentialId) return c.json({ error: "file and credential_id required" }, 400);
    const blob = file instanceof Blob ? file : null;
    if (!blob) return c.json({ error: "Invalid file" }, 400);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const mimeType = blob.type || "application/octet-stream";
    const originalName = blob.name || "upload";
    const result = await uploadToCloud(
      { db: ctx.db },
      { userId: user.id, credentialId, provider, buffer, mimeType, originalName }
    );
    if (result.error) return c.json({ error: result.error }, 400);
    if (result.external_id) {
      const deleteAt = new Date(Date.now() + 60 * 60 * 1000);
      await ctx.db.query(
        "insert into public.upload_expiry (tenant_id, credential_id, provider, external_id, delete_at) values ($1, $2, $3, $4, $5)",
        [user.id, credentialId, provider, result.external_id, deleteAt]
      ).catch(() => {});
    }
    return c.json(result);
  });

  protectedApi.get("/api/settings", async (c) => {
    const user = c.get("user");
    const { rows } = await ctx.db.query("select setting_key, setting_value from public.system_settings where user_id = $1", [user.id]);
    const out = {};
    for (const r of rows) out[r.setting_key] = r.setting_value;
    return c.json(out);
  });

  protectedApi.put("/api/settings", async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const data = body?.settings && typeof body.settings === "object" ? body.settings : body && typeof body === "object" ? body : {};
    for (const [key, value] of Object.entries(data)) {
      await ctx.db.query(
        "insert into public.system_settings (user_id, setting_key, setting_value) values ($1, $2, $3) on conflict (user_id, setting_key) do update set setting_value = $3",
        [user.id, key, JSON.stringify(value)]
      );
    }
    const { rows } = await ctx.db.query("select setting_key, setting_value from public.system_settings where user_id = $1", [user.id]);
    const out = {};
    for (const r of rows) out[r.setting_key] = r.setting_value;
    return c.json(out);
  });

  if (config.enableInternalTestRoutes) {
    protectedApi.post("/api/apify/test/verify", async (c) => {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const apiKeyId = body?.api_key_id ?? body?.apiKeyId;
    if (!apiKeyId) return c.json({ error: "api_key_id wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const credential = await findLatestActiveCredential(user.id, "apify");
    const token = getApifyTokenFromCredential(credential);
    await logGatewayRequest(ctx, {
      tenantId: user.id,
      apiKeyId: apiKey.id,
      apiKeyKeyHash: apiKey.key_hash,
      provider: "apify",
      method: "GET",
      statusCode: credential && token ? 200 : 404,
      responseTimeMs: 1,
      originDomain: "dashboard-internal",
      requestPath: "/verify",
      errorMessage: credential && token ? null : "Credential Apify aktif tidak ditemukan",
      credentialId: credential?.id ?? null,
      clientAuthUsed: !!apiKey.client_username,
      upstreamStatus: credential && token ? 200 : 404,
      metadata: { helper_test: true, verify_only: true },
    });
    if (!credential || !token) {
      return c.json({ error: "Credential Apify aktif tidak ditemukan atau api_token kosong." }, 404);
    }
    return c.json({
      ok: true,
      provider: "apify",
      apiKey: { id: apiKey.id, name: apiKey.name ?? "Unnamed" },
      credential: { id: credential.id },
      defaults: {
        listActorsPath: "/acts?limit=10",
        listTasksPath: "/actor-tasks?limit=10",
        runActorPath: "/acts/:actorId/runs?waitForFinish=30",
        runTaskPath: "/actor-tasks/:taskId/runs?waitForFinish=30",
      },
    });
    });

    protectedApi.get("/api/apify/test/actors", async (c) => {
    const user = c.get("user");
    const apiKeyId = c.req.query("apiKeyId");
    if (!apiKeyId) return c.json({ error: "apiKeyId wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const result = await callApifyHelper({
      tenantId: user.id,
      apiKey,
      path: "/acts",
      query: { limit: c.req.query("limit") ?? 10, offset: c.req.query("offset") ?? 0 },
      requestPath: "/acts",
    });
      if (!result.ok) return c.json({ error: result.error ?? "Gagal memuat actors." }, result.status);
    return c.json(normalizeApifyCollection(result.payload));
    });

    protectedApi.get("/api/apify/test/tasks", async (c) => {
    const user = c.get("user");
    const apiKeyId = c.req.query("apiKeyId");
    if (!apiKeyId) return c.json({ error: "apiKeyId wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const result = await callApifyHelper({
      tenantId: user.id,
      apiKey,
      path: "/actor-tasks",
      query: { limit: c.req.query("limit") ?? 10, offset: c.req.query("offset") ?? 0 },
      requestPath: "/actor-tasks",
    });
      if (!result.ok) return c.json({ error: result.error ?? "Gagal memuat tasks." }, result.status);
    return c.json(normalizeApifyCollection(result.payload));
    });

    protectedApi.post("/api/apify/test/run", async (c) => {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const apiKeyId = body?.api_key_id ?? body?.apiKeyId;
    const mode = body?.mode === "task" ? "task" : "actor";
    const targetId = String(body?.target_id ?? body?.targetId ?? "").trim();
    const waitForFinish = Number(body?.wait_for_finish ?? body?.waitForFinish ?? 30);
    const input = body?.input && typeof body.input === "object" ? body.input : {};
    if (!apiKeyId) return c.json({ error: "api_key_id wajib" }, 400);
    if (!targetId) return c.json({ error: "target_id wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const path = mode === "task" ? `/actor-tasks/${encodeURIComponent(targetId)}/runs` : `/acts/${encodeURIComponent(targetId)}/runs`;
    const result = await callApifyHelper({
      tenantId: user.id,
      apiKey,
      path,
      method: "POST",
      query: { waitForFinish: Number.isFinite(waitForFinish) && waitForFinish > 0 ? waitForFinish : 30 },
      body: input,
      requestPath: path,
    });
      if (!result.ok) return c.json({ error: result.error ?? "Gagal menjalankan Apify run." }, result.status);
    return c.json(normalizeApifyRun(result.payload));
    });

    protectedApi.get("/api/apify/test/runs/:runId", async (c) => {
    const user = c.get("user");
    const apiKeyId = c.req.query("apiKeyId");
    const runId = c.req.param("runId");
    if (!apiKeyId) return c.json({ error: "apiKeyId wajib" }, 400);
    if (!runId) return c.json({ error: "runId wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const path = `/actor-runs/${encodeURIComponent(runId)}`;
    const result = await callApifyHelper({
      tenantId: user.id,
      apiKey,
      path,
      requestPath: path,
    });
      if (!result.ok) return c.json({ error: result.error ?? "Gagal memuat status run." }, result.status);
    return c.json(normalizeApifyRun(result.payload));
    });

    protectedApi.get("/api/apify/test/datasets/:datasetId/items", async (c) => {
    const user = c.get("user");
    const apiKeyId = c.req.query("apiKeyId");
    const datasetId = c.req.param("datasetId");
    if (!apiKeyId) return c.json({ error: "apiKeyId wajib" }, 400);
    if (!datasetId) return c.json({ error: "datasetId wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const path = `/datasets/${encodeURIComponent(datasetId)}/items`;
    const result = await callApifyHelper({
      tenantId: user.id,
      apiKey,
      path,
      query: {
        limit: c.req.query("limit") ?? 10,
        offset: c.req.query("offset") ?? 0,
        clean: c.req.query("clean") ?? 1,
      },
      requestPath: path,
    });
      if (!result.ok) return c.json({ error: result.error ?? "Gagal memuat data dataset." }, result.status);
    return c.json(normalizeApifyCollection(result.payload));
    });

    protectedApi.post("/api/apify/test/smoke", async (c) => {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const apiKeyId = body?.api_key_id ?? body?.apiKeyId;
    if (!apiKeyId) return c.json({ error: "api_key_id wajib" }, 400);
    const apiKey = await getOwnedGatewayKeyForProvider(user.id, apiKeyId, "apify");
    if (!apiKey) return c.json({ error: "Gateway API key Apify tidak ditemukan atau tidak diizinkan." }, 404);
    const verifyOk = !!(await findLatestActiveCredential(user.id, "apify"));
    const [actorsResult, tasksResult] = await Promise.all([
      callApifyHelper({ tenantId: user.id, apiKey, path: "/acts", query: { limit: 10 }, requestPath: "/acts" }),
      callApifyHelper({ tenantId: user.id, apiKey, path: "/actor-tasks", query: { limit: 10 }, requestPath: "/actor-tasks" }),
    ]);
      if (!actorsResult.ok) return c.json({ error: actorsResult.error ?? "Verifikasi actor gagal." }, actorsResult.status);
      if (!tasksResult.ok) return c.json({ error: tasksResult.error ?? "Verifikasi task gagal." }, tasksResult.status);
    return c.json(
      normalizeApifySmoke({
        verifyOk,
        actors: normalizeApifyCollection(actorsResult.payload),
        tasks: normalizeApifyCollection(tasksResult.payload),
      })
    );
    });
  }

  const gateway = new OpenAPIHono();
  const getOriginDomain = (c) => {
    const originRaw = c.req.header("origin") || c.req.header("referer");
    if (!originRaw) return null;
    try {
      return new URL(originRaw).hostname;
    } catch {
      return null;
    }
  };

  const logGatewayRateLimitExceeded = async (c, detail) => {
    const apiKey = c.get("apiKey");
    if (!apiKey) return;
    await logGatewayRequest(ctx, {
      tenantId: apiKey.tenant_id,
      apiKeyId: apiKey.id,
      apiKeyKeyHash: apiKey.key_hash,
      provider: "gateway",
      method: c.req.method.toUpperCase(),
      statusCode: 429,
      responseTimeMs: 0,
      originDomain: getOriginDomain(c),
      requestPath: c.req.path,
      errorMessage: "Gateway rate limited",
      credentialId: null,
      clientAuthUsed: !!apiKey.client_username,
      rateLimited: true,
      upstreamStatus: 429,
      metadata: detail,
    }).catch(() => {});
    await createAlert(ctx, {
      tenantId: apiKey.tenant_id,
      severity: "warning",
      category: "gateway_rate_limited",
      title: "Burst request tertahan rate limit gateway",
      message: `Gateway menahan request karena melewati limit ${detail.limit}/window.`,
      provider: "gateway",
      apiKeyId: apiKey.id,
      dedupeKey: `gateway-rate-limit:${apiKey.id}`,
      metadata: detail,
    }).catch(() => {});
  };

  // ctx.ws.broadcast no-op bila tidak ada WebSocket server (serverless).
  gateway.use("*", apiKeyAuth({ l1: ctx.l1, l2: ctx.l2, db: ctx.db, redis: ctx.redis, ws: ctx.ws }));
  gateway.use("*", loadHmacSecret({ redis: ctx.redis, db: ctx.db, getTenantId: (c) => c.get("apiKey")?.tenant_id }));
  gateway.use("*", hmacAuth(ctx.redis));
  gateway.use("*", rateLimit(ctx.redis, {
    keyPrefix: "rlk",
    limit: (c) => c.get("apiKey")?.quota_per_minute ?? config.rateLimitDefault,
    windowMs: config.rateLimitWindowMs,
    onLimitExceeded: logGatewayRateLimitExceeded,
  }));

  gateway.get("/verify", (c) => c.json({ ok: true }));

  const getCredentialValiditySql = (provider) => {
    switch ((provider || "").toLowerCase()) {
      case "gemini":
      case "groq":
        return "coalesce(credentials->>'api_key', credentials->>'apiKey', '') not in ('', 'dummy_gemini_key', 'dummy_groq_key')";
      case "apify":
        return "coalesce(credentials->>'api_token', credentials->>'apiToken', '') <> ''";
      case "cloudinary":
        return [
          "coalesce(credentials->>'cloud_name', credentials->>'cloudName', '') <> ''",
          "coalesce(credentials->>'api_key', credentials->>'apiKey', '') <> ''",
          "coalesce(credentials->>'api_secret', credentials->>'apiSecret', '') <> ''",
        ].join(" and ");
      case "imagekit":
        return [
          "coalesce(credentials->>'public_key', credentials->>'publicKey', '') <> ''",
          "coalesce(credentials->>'private_key', credentials->>'privateKey', '') <> ''",
          "coalesce(credentials->>'url_endpoint', credentials->>'urlEndpoint', '') <> ''",
        ].join(" and ");
      default:
        return null;
    }
  };

  const findLatestActiveCredential = async (userId, provider) => {
    const validitySql = getCredentialValiditySql(provider);
    if (!validitySql) return null;
    await reactivateExpiredCredentialCooldowns(ctx.db, { userId, provider });
    const { rows } = await ctx.db.query(
      `select id, credentials from public.provider_credentials
       where user_id = $1 and provider_name = $2 and status = 'active'
         and ${validitySql}
       order by created_at desc limit 1`,
      [userId, provider]
    );
    return rows[0] ?? null;
  };

  const getOwnedGatewayKeyForProvider = async (tenantId, apiKeyId, provider) => {
    const { rows } = await ctx.db.query(
      `select id, tenant_id, key_hash, client_username, allowed_providers, name, quota_per_minute
         from public.api_keys
        where id = $1 and tenant_id = $2 and $3 = any(coalesce(allowed_providers, '{}'::text[]))
        limit 1`,
      [apiKeyId, tenantId, provider]
    );
    return rows[0] ?? null;
  };

  const callApifyHelper = async ({
    tenantId,
    apiKey,
    path,
    method = "GET",
    query = {},
    body = null,
    requestPath = path,
  }) => {
    const credential = await findLatestActiveCredential(tenantId, "apify");
    if (!credential) {
      await logGatewayRequest(ctx, {
        tenantId,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider: "apify",
        method,
        statusCode: 404,
        responseTimeMs: 1,
        originDomain: "dashboard-internal",
        requestPath,
        errorMessage: "Credential Apify aktif tidak ditemukan.",
        clientAuthUsed: !!apiKey.client_username,
        upstreamStatus: 404,
        metadata: { helper_test: true, query },
      });
      return { ok: false, status: 404, error: "Credential Apify aktif tidak ditemukan. Tambahkan credential Apify di halaman Credentials." };
    }
    const token = getApifyTokenFromCredential(credential);
    if (!token) {
      await logGatewayRequest(ctx, {
        tenantId,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider: "apify",
        method,
        statusCode: 400,
        responseTimeMs: 1,
        originDomain: "dashboard-internal",
        requestPath,
        errorMessage: "Credential Apify belum berisi api_token yang valid.",
        credentialId: credential.id,
        clientAuthUsed: !!apiKey.client_username,
        upstreamStatus: 400,
        metadata: { helper_test: true, query },
      });
      return { ok: false, status: 400, error: "Credential Apify belum berisi api_token yang valid." };
    }
    const upstream = ctx.providerUpstreams.apify;
    const url = new URL(upstream);
    url.pathname = path.startsWith("/") ? path : `/${path}`;
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    const startedAt = performance.now();
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body != null ? { "Content-Type": "application/json" } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await res.json().catch(() => ({})) : await res.text();
      await logGatewayRequest(ctx, {
        tenantId,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider: "apify",
        method,
        statusCode: res.status,
        responseTimeMs: latencyMs,
        originDomain: "dashboard-internal",
        requestPath,
        errorMessage: res.ok ? null : (typeof payload === "string" ? payload.slice(0, 240) : payload?.error?.message ?? payload?.error ?? "Apify request failed"),
        credentialId: credential.id,
        clientAuthUsed: !!apiKey.client_username,
        upstreamStatus: res.status,
        metadata: { helper_test: true, upstream: url.pathname, query },
      });
      return { ok: res.ok, status: res.status, payload, credentialId: credential.id };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const message = err instanceof Error ? err.message : "Apify request gagal";
      await logGatewayRequest(ctx, {
        tenantId,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider: "apify",
        method,
        statusCode: 503,
        responseTimeMs: latencyMs,
        originDomain: "dashboard-internal",
        requestPath,
        errorMessage: message,
        credentialId: credential.id,
        clientAuthUsed: !!apiKey.client_username,
        breakerOpen: true,
        upstreamStatus: 503,
        metadata: { helper_test: true, query },
      });
      return { ok: false, status: 503, error: message, credentialId: credential.id };
    }
  };

  async function handleGatewayUpload(c, provider) {
    const start = performance.now();
    const apiKey = c.get("apiKey");
    const allowed = apiKey.allowed_providers;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(provider)) {
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: "POST",
        statusCode: 403,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage: "Provider not allowed for this API key",
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: "Provider not allowed for this API key" }, 403);
    }
    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ error: "Form data required" }, 400);
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) return c.json({ error: "file required" }, 400);
    if (file.size > config.maxUploadBytes) {
      return c.json({ error: `Ukuran file melebihi batas ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.` }, 413);
    }
    const credential = await findLatestActiveCredential(apiKey.tenant_id, provider);
    if (!credential) {
      const providerMessage = provider === "imagekit"
        ? "Pastikan public_key, private_key, dan url_endpoint terisi."
        : provider === "cloudinary"
          ? "Pastikan cloud_name, api_key, dan api_secret terisi."
          : "Pastikan credential aktif dan terisi lengkap.";
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: "POST",
        statusCode: 404,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage: `No active ${provider} credential yang valid. ${providerMessage}`,
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: `No active ${provider} credential yang valid. ${providerMessage}` }, 404);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const originalName = file.name || "upload";
    const result = await uploadToCloud(
      { db: ctx.db },
      { userId: apiKey.tenant_id, credentialId: credential.id, provider, buffer, mimeType, originalName }
    );
    const latencyMs = Math.round(performance.now() - start);
    await logGatewayRequest(ctx, {
      tenantId: apiKey.tenant_id,
      apiKeyId: apiKey.id,
      apiKeyKeyHash: apiKey.key_hash,
      provider,
      method: "POST",
      statusCode: result.error ? 400 : 200,
      responseTimeMs: latencyMs,
      originDomain: getOriginDomain(c),
      requestPath: c.req.path,
      errorMessage: result.error ?? null,
      credentialId: credential.id,
      clientAuthUsed: !!apiKey.client_username,
      metadata: result.error ? {} : { cdn_url: result.cdn_url ?? result.url ?? null },
    });
    if (result.error) return c.json({ error: result.error }, 400);
    if (result.external_id) {
      const { rows: settingRows } = await ctx.db.query(
        "select setting_value from public.system_settings where user_id = $1 and setting_key = $2",
        [apiKey.tenant_id, "upload_expiry_minutes"]
      );
      const raw = settingRows[0]?.setting_value;
      let mins = 0;
      if (raw != null && raw !== "") {
        let parsed = 0;
        try {
          const v = JSON.parse(raw);
          parsed = typeof v === "number" ? v : parseInt(String(v), 10) || 0;
        } catch {
          parsed = parseInt(String(raw), 10) || 0;
        }
        if (Number.isFinite(parsed) && parsed > 0) mins = parsed;
      }
      if (mins > 0) {
        const deleteAt = new Date(Date.now() + mins * 60 * 1000);
        await ctx.db.query(
          "insert into public.upload_expiry (tenant_id, credential_id, provider, external_id, delete_at) values ($1, $2, $3, $4, $5)",
          [apiKey.tenant_id, credential.id, provider, result.external_id, deleteAt]
        ).catch(() => {});
      }
    }
    return c.json(result);
  }

  gateway.post("/cloudinary/upload", (c) => handleGatewayUpload(c, "cloudinary"));
  gateway.post("/imagekit/upload", (c) => handleGatewayUpload(c, "imagekit"));

  async function handleGatewayChat(c, provider) {
    const start = performance.now();
    const apiKey = c.get("apiKey");
    const allowed = apiKey.allowed_providers;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(provider)) {
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: "POST",
        statusCode: 403,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage: "Provider not allowed for this API key",
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: "Provider not allowed for this API key" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt != null ? String(body.prompt) : "";
    const credential = await findLatestActiveCredential(apiKey.tenant_id, provider);
    if (!credential) {
      const errorMessage = `No active ${provider} credential with valid API key. Di Credentials, tambah atau edit credential ${provider} dan isi API key (sama seperti yang dipakai di Playground).`
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: "POST",
        statusCode: 404,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage,
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: errorMessage }, 404);
    }
    const result = await chatWithProvider(
      { db: ctx.db },
      { userId: apiKey.tenant_id, credentialId: credential.id, prompt: prompt || "Hello", modelId: body.model_id || null }
    );
    const ms = Math.round(performance.now() - start);
    const statusCode = result.error ? 400 : 200;
    await logGatewayRequest(ctx, {
      tenantId: apiKey.tenant_id,
      apiKeyId: apiKey.id,
      apiKeyKeyHash: apiKey.key_hash,
      provider,
      method: "POST",
      statusCode,
      responseTimeMs: ms,
      originDomain: getOriginDomain(c),
      requestPath: c.req.path,
      errorMessage: result.error ?? null,
      credentialId: credential.id,
      clientAuthUsed: !!apiKey.client_username,
      metadata: result.error ? {} : { model: result.model ?? null },
    });

    if (result.error) {
      const msg = result.error.includes("API key not valid") || result.error.includes("not valid")
        ? `${result.error} Pastikan di dashboard → Credentials → credential Gemini berisi API key valid dari https://aistudio.google.com/app/apikey`
        : result.error;
      return c.json({ error: msg }, 400);
    }
    return c.json({ text: result.text, model: result.model });
  }

  gateway.post("/gemini/chat", (c) => handleGatewayChat(c, "gemini"));
  gateway.post("/groq/chat", (c) => handleGatewayChat(c, "groq"));

  gateway.all("/:provider/*", async (c) => {
    const start = performance.now();
    const apiKey = c.get("apiKey");
    const provider = c.req.param("provider");
    const allowed = apiKey.allowed_providers;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(provider)) {
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: c.req.method.toUpperCase(),
        statusCode: 403,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage: "Provider not allowed for this API key",
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: "Provider not allowed for this API key" }, 403);
    }
    const subPath = c.req.path.replace(new RegExp(`^/${provider}`), "") || "/";
    const upstream = ctx.providerUpstreams[provider] ?? ctx.ring.pick(`${apiKey.id}:${provider}`) ?? null;
    if (!upstream) {
      const errorMessage = "No upstream untuk provider: " + provider + ". Didukung: gemini, groq, apify, cloudinary, imagekit";
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method: c.req.method.toUpperCase(),
        statusCode: 503,
        responseTimeMs: Math.round(performance.now() - start),
        originDomain: getOriginDomain(c),
        requestPath: c.req.path,
        errorMessage,
        clientAuthUsed: !!apiKey.client_username,
      });
      return c.json({ error: errorMessage }, 503);
    }

    const url = new URL(upstream);
    url.pathname = subPath;
    url.search = new URL(c.req.url).search;
    const canonicalQuery = canonicalizeSearch(c.req.url);

    // Ambil credential provider (Gemini/Groq) dari Credentials agar request ke upstream pakai API key yang benar
    let providerApiKey = null;
    const credential = await findLatestActiveCredential(apiKey.tenant_id, provider);
    if (credential?.credentials) {
      const cred = typeof credential.credentials === "object" ? credential.credentials : JSON.parse(credential.credentials);
      providerApiKey = cred?.api_key ?? cred?.apiKey ?? null;
    }
    if (provider === "gemini" && providerApiKey) {
      url.searchParams.set("key", providerApiKey);
    }

    const method = c.req.method.toUpperCase();
    const cacheable = method === "GET";
    const cacheScope = credential?.id ?? "no-credential";
    const cacheKey = cacheable
      ? `resp:${apiKey.tenant_id}:${provider}:${cacheScope}:${hashCacheSuffix(`${subPath}?${canonicalQuery}`)}`
      : null;

    if (cacheable) {
      const l1 = ctx.l1.get(cacheKey);
      if (l1) {
        await logGatewayRequest(ctx, {
          tenantId: apiKey.tenant_id,
          apiKeyId: apiKey.id,
          apiKeyKeyHash: apiKey.key_hash,
          provider,
          method,
          statusCode: l1.status,
          responseTimeMs: Math.round(performance.now() - start),
          originDomain: getOriginDomain(c),
          requestPath: subPath,
          credentialId: credential?.id ?? null,
          clientAuthUsed: !!apiKey.client_username,
          upstreamStatus: l1.status,
          metadata: { cache: "l1", cacheable: true },
        });
        c.header("Cache-Control", "public, max-age=1, stale-if-error=30, stale-while-revalidate=10");
        c.header("Surrogate-Control", "max-age=30, stale-if-error=300");
        return c.body(l1.body, l1.status, l1.headers);
      }
      const l2 = await ctx.l2.getResponse(cacheKey);
      if (l2) {
        ctx.l1.set(cacheKey, l2, 1000);
        await logGatewayRequest(ctx, {
          tenantId: apiKey.tenant_id,
          apiKeyId: apiKey.id,
          apiKeyKeyHash: apiKey.key_hash,
          provider,
          method,
          statusCode: l2.status,
          responseTimeMs: Math.round(performance.now() - start),
          originDomain: getOriginDomain(c),
          requestPath: subPath,
          credentialId: credential?.id ?? null,
          clientAuthUsed: !!apiKey.client_username,
          upstreamStatus: l2.status,
          metadata: { cache: "l2", cacheable: true },
        });
        c.header("Cache-Control", "public, max-age=1, stale-if-error=30, stale-while-revalidate=10");
        c.header("Surrogate-Control", "max-age=30, stale-if-error=300");
        return c.body(l2.body, l2.status, l2.headers);
      }
    }

    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (contentLength > config.maxProxyBodyBytes) {
      return c.json({ error: `Ukuran request melebihi batas ${Math.round(config.maxProxyBodyBytes / (1024 * 1024))} MB.` }, 413);
    }
    const upstreamHeaders = {
      "content-type": c.req.header("content-type") ?? "application/json",
    };
    const requestBody = hasBody(method) ? c.req.raw.body : undefined;
    if (provider === "groq" && providerApiKey) {
      upstreamHeaders["Authorization"] = `Bearer ${providerApiKey}`;
    }
    try {
      const res = await ctx.breaker.run(`${provider}:${upstream}`, async ({ signal }) =>
        fetch(url.toString(), {
          method,
          headers: upstreamHeaders,
          body: requestBody ?? undefined,
          duplex: requestBody ? "half" : undefined,
          signal,
        }),
      );
      const ms = performance.now() - start;
      const originDomain = getOriginDomain(c);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const shouldReadForMessage = res.status >= 400 && /(json|text)/i.test(contentType);
      const shouldBufferResponse = cacheable || shouldReadForMessage;
      const responseBuffer = shouldBufferResponse ? Buffer.from(await res.clone().arrayBuffer()) : null;
      const errorMessage = shouldReadForMessage && responseBuffer
        ? responseBuffer.toString("utf8").slice(0, 240)
        : null;
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method,
        statusCode: res.status,
        responseTimeMs: Math.round(ms),
        originDomain,
        requestPath: subPath,
        errorMessage,
        credentialId: credential?.id ?? null,
        clientAuthUsed: !!apiKey.client_username,
        upstreamStatus: res.status,
        metadata: { upstream: url.origin, cacheable },
      });

      const remaining = c.get("rateLimit")?.remaining ?? null;
      const healthCacheKey = `health:${apiKey.tenant_id}:${apiKey.id}`;
      const shouldPersistHealth = res.status >= 400 || !ctx.l1.get(`health-write:${healthCacheKey}`);
      if (shouldPersistHealth) {
        ctx.l1.set(`health-write:${healthCacheKey}`, true, 10_000);
        await ctx.l2.setJson(healthCacheKey, { last_latency_ms: ms, last_status: res.status, remaining }, 30000);
      }

      if (res.status >= 400) {
        ctx.ws.broadcastToTenant?.(apiKey.tenant_id, { type: "gateway.error", at: Date.now(), tenantId: apiKey.tenant_id, apiKeyId: apiKey.id, status: res.status, provider });
      }

      const headers = { "content-type": contentType };
      if (cacheable) {
        const cached = { status: res.status, headers, body: responseBuffer };
        ctx.l1.set(cacheKey, cached, 1000);
        await ctx.l2.setResponse(cacheKey, cached, 30000);
        c.header("Cache-Control", "public, max-age=1, stale-if-error=30, stale-while-revalidate=10");
        c.header("Surrogate-Control", "max-age=30, stale-if-error=300");
        return c.body(responseBuffer, res.status, headers);
      }
      if (responseBuffer) {
        return c.body(responseBuffer, res.status, headers);
      }
      return new Response(res.body, { status: res.status, headers: res.headers });
    } catch (err) {
      const msFail = Math.round(performance.now() - start);
      const originDomain = getOriginDomain(c);
      await logGatewayRequest(ctx, {
        tenantId: apiKey.tenant_id,
        apiKeyId: apiKey.id,
        apiKeyKeyHash: apiKey.key_hash,
        provider,
        method,
        statusCode: 503,
        responseTimeMs: msFail,
        originDomain,
        requestPath: subPath,
        errorMessage: err instanceof Error ? err.message : "Upstream gagal",
        credentialId: credential?.id ?? null,
        clientAuthUsed: !!apiKey.client_username,
        breakerOpen: true,
        upstreamStatus: 503,
        metadata: { upstream: url.origin, cacheable },
      });
      if (cacheable) {
        const stale = ctx.l1.getStale(cacheKey) ?? (await ctx.l2.getResponse(cacheKey));
        if (stale) {
          c.header("Cache-Control", "public, max-age=0, stale-if-error=30");
          c.header("Surrogate-Control", "max-age=0, stale-if-error=300");
          return c.body(stale.body, stale.status, stale.headers);
        }
      }
      return c.json({ error: "Upstream gagal" }, 503);
    }
  });

  app.route("/gateway", gateway);
  app.route("/", protectedApi);

  if (!config.isServerless) {
    const UPLOAD_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;
    const cleanupTimer = setInterval(async () => {
      try {
        const { rows } = await ctx.db.query(
          "select id, tenant_id, credential_id, provider, external_id from public.upload_expiry where delete_at <= now() limit 50"
        );
        for (const r of rows) {
          await deleteFromCloud({ db: ctx.db }, { credentialId: r.credential_id, userId: r.tenant_id, provider: r.provider, externalId: r.external_id });
          await ctx.db.query("delete from public.upload_expiry where id = $1", [r.id]);
        }
      } catch (_) { /* ignore */ }
    }, UPLOAD_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
  }

  return app;
};

export const createNodeServer = async () => {
  const ctx = await createServerContext();
  const app = createApp(ctx);
  return { ctx, app };
};
