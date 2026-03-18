import { apiKeyRotations, gatewayAlertsTotal, gatewayAnomaliesTotal, gatewayAutoRotationsTotal, gatewayCredentialCooldownsTotal } from "../infra/metrics.js"
import { rotateApiKey } from "./apiKeys.js"

const BURST_THRESHOLD_WARNING = 80
const BURST_THRESHOLD_CRITICAL = 160
const LEAK_DOMAIN_THRESHOLD = 2
const PROVIDER_INCIDENT_THRESHOLD = 5
const PROVIDER_OUTAGE_THRESHOLD = 8
const RATE_LIMIT_COOLDOWN_SECONDS = 120
const OUTAGE_COOLDOWN_SECONDS = 60

export const classifyErrorType = ({ statusCode, errorMessage = "", rateLimited = false }) => {
  const message = String(errorMessage || "").toLowerCase()
  if (!statusCode || statusCode < 400) return "success"
  if (rateLimited || statusCode === 429 || message.includes("rate limit")) return "provider_rate_limit"
  if (message.includes("timeout")) return "upstream_timeout"
  if (message.includes("api key not valid") || message.includes("invalid api key") || message.includes("invalid signature")) return "provider_auth"
  if (message.includes("credential") && message.includes("not found")) return "credential_missing"
  if (statusCode === 401 || statusCode === 403) return "auth_rejected"
  if (statusCode >= 500) return "upstream_unavailable"
  return "client_error"
}

export const detectLeakRisk = ({ burstCount = 0, distinctDomains = 0, recentRequests = 0 }) => {
  if (burstCount >= BURST_THRESHOLD_CRITICAL && distinctDomains >= LEAK_DOMAIN_THRESHOLD) return "critical"
  if (burstCount >= BURST_THRESHOLD_WARNING && distinctDomains >= LEAK_DOMAIN_THRESHOLD && recentRequests >= BURST_THRESHOLD_WARNING) return "warning"
  return null
}

export const getRemediationPolicy = ({ errorType, anomalyTypes = [] }) => {
  if (anomalyTypes.includes("possible_api_key_leak")) return "rotate_api_key"
  if (errorType === "provider_rate_limit" || errorType === "upstream_timeout" || errorType === "upstream_unavailable") return "cooldown_credential"
  return "none"
}

const trimMessage = (value, max = 240) => {
  const text = String(value || "").trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

const parseJsonSafely = (value, fallback = {}) => {
  try {
    return value && typeof value === "string" ? JSON.parse(value) : (value ?? fallback)
  } catch {
    return fallback
  }
}

const toJson = (value) => JSON.stringify(value ?? {})

const pushUnique = (items, value) => {
  if (!value || items.includes(value)) return items
  items.push(value)
  return items
}

async function upsertProviderCredentialStats(db, { credentialId, success }) {
  if (!credentialId) return
  await db.query(
    `update public.provider_credentials
     set total_requests = total_requests + 1,
         failed_requests = failed_requests + $2
     where id = $1`,
    [credentialId, success ? 0 : 1]
  ).catch(() => {})
}

async function getRecentApiKeyStats(db, { apiKeyId }) {
  const { rows } = await db.query(
    `select count(*)::int as requests,
            count(distinct origin_domain) filter (where origin_domain is not null and origin_domain <> '')::int as domains
       from public.gateway_request_logs
      where api_key_id = $1 and created_at >= now() - interval '10 minutes'`,
    [apiKeyId]
  )
  return {
    requests: Number(rows[0]?.requests ?? 0),
    domains: Number(rows[0]?.domains ?? 0),
  }
}

async function getProviderErrorStats(db, { tenantId, provider }) {
  const { rows } = await db.query(
    `select count(*)::int as errors,
            count(*) filter (where status_code = 429)::int as rate_limited,
            count(*) filter (where status_code >= 500)::int as server_errors
       from public.gateway_request_logs
      where tenant_id = $1 and provider = $2 and status_code >= 400
        and created_at >= now() - interval '2 minutes'`,
    [tenantId, provider]
  )
  return {
    errors: Number(rows[0]?.errors ?? 0),
    rateLimited: Number(rows[0]?.rate_limited ?? 0),
    serverErrors: Number(rows[0]?.server_errors ?? 0),
  }
}

export async function reactivateExpiredCredentialCooldowns(db, { userId, provider = null } = {}) {
  const params = [userId]
  let sql =
    `update public.provider_credentials
        set status = 'active', cooldown_until = null
      where user_id = $1 and status = 'cooldown'
        and cooldown_until is not null and cooldown_until <= now()`
  if (provider) {
    params.push(provider)
    sql += ` and provider_name = $2`
  }
  await db.query(sql, params).catch(() => {})
}

export async function getProviderAvailability(db, { userId, provider }) {
  await reactivateExpiredCredentialCooldowns(db, { userId, provider })
  const { rows } = await db.query(
    `select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where status = 'cooldown')::int as cooldown
       from public.provider_credentials
      where user_id = $1 and provider_name = $2`,
    [userId, provider]
  )
  return {
    total: Number(rows[0]?.total ?? 0),
    active: Number(rows[0]?.active ?? 0),
    cooldown: Number(rows[0]?.cooldown ?? 0),
  }
}

export async function ensureObservabilitySchema(db) {
  await db.query(`alter table public.gateway_request_logs add column if not exists request_path text`)
  await db.query(`alter table public.gateway_request_logs add column if not exists error_type text`)
  await db.query(`alter table public.gateway_request_logs add column if not exists error_message text`)
  await db.query(`alter table public.gateway_request_logs add column if not exists credential_id uuid references public.provider_credentials(id) on delete set null`)
  await db.query(`alter table public.gateway_request_logs add column if not exists client_auth_used boolean not null default false`)
  await db.query(`alter table public.gateway_request_logs add column if not exists rate_limited boolean not null default false`)
  await db.query(`alter table public.gateway_request_logs add column if not exists breaker_open boolean not null default false`)
  await db.query(`alter table public.gateway_request_logs add column if not exists upstream_status integer`)
  await db.query(`alter table public.gateway_request_logs add column if not exists detected_anomaly_types text[] not null default '{}'`)
  await db.query(`alter table public.gateway_request_logs add column if not exists metadata jsonb not null default '{}'::jsonb`)
  await db.query(`create index if not exists idx_gateway_logs_provider_created on public.gateway_request_logs(provider, created_at desc)`)
  await db.query(`create index if not exists idx_gateway_logs_status_created on public.gateway_request_logs(status_code, created_at desc)`)
  await db.query(`create index if not exists idx_gateway_logs_credential_created on public.gateway_request_logs(credential_id, created_at desc)`)
  await db.query(
    `create table if not exists public.gateway_alerts (
      id uuid not null default gen_random_uuid() primary key,
      tenant_id uuid not null references public.users(id) on delete cascade,
      severity text not null,
      category text not null,
      title text not null,
      message text not null,
      provider text,
      api_key_id uuid references public.api_keys(id) on delete set null,
      credential_id uuid references public.provider_credentials(id) on delete set null,
      status text not null default 'active',
      dedupe_key text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      acknowledged_at timestamp with time zone,
      read_at timestamp with time zone,
      resolved_at timestamp with time zone
    )`
  )
  await db.query(`create index if not exists idx_gateway_alerts_tenant_created on public.gateway_alerts(tenant_id, created_at desc)`)
  await db.query(`create index if not exists idx_gateway_alerts_tenant_status on public.gateway_alerts(tenant_id, status, created_at desc)`)
  await db.query(`create index if not exists idx_gateway_alerts_dedupe on public.gateway_alerts(tenant_id, dedupe_key, created_at desc)`)
}

export async function createAlert(ctx, input) {
  const metadata = input.metadata ?? {}
  const dedupeKey = input.dedupeKey ?? null
  if (dedupeKey) {
    const { rows } = await ctx.db.query(
      `select id, metadata from public.gateway_alerts
        where tenant_id = $1 and dedupe_key = $2 and status = 'active'
          and created_at >= now() - interval '15 minutes'
        order by created_at desc
        limit 1`,
      [input.tenantId, dedupeKey]
    )
    const existing = rows[0]
    if (existing) {
      const previous = parseJsonSafely(existing.metadata, {})
      const occurrenceCount = Number(previous.occurrence_count ?? 1) + 1
      const mergedMetadata = { ...previous, ...metadata, occurrence_count: occurrenceCount }
      const { rows: updatedRows } = await ctx.db.query(
        `update public.gateway_alerts
            set updated_at = now(),
                metadata = $2,
                message = $3
          where id = $1
        returning *`,
        [existing.id, toJson(mergedMetadata), input.message]
      )
      return updatedRows[0]
    }
  }

  const { rows } = await ctx.db.query(
    `insert into public.gateway_alerts
      (tenant_id, severity, category, title, message, provider, api_key_id, credential_id, status, dedupe_key, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)
     returning *`,
    [
      input.tenantId,
      input.severity,
      input.category,
      input.title,
      input.message,
      input.provider ?? null,
      input.apiKeyId ?? null,
      input.credentialId ?? null,
      dedupeKey,
      toJson(metadata),
    ]
  )
  const alert = rows[0]
  gatewayAlertsTotal.inc({ tenant_id: input.tenantId, category: input.category, severity: input.severity })
  ctx.ws.broadcastToTenant?.(input.tenantId, {
    type: "alert.created",
    tenantId: input.tenantId,
    at: Date.now(),
    alert,
  })
  return alert
}

export async function acknowledgeAlert(db, { tenantId, id }) {
  const { rows } = await db.query(
    `update public.gateway_alerts
        set acknowledged_at = coalesce(acknowledged_at, now()),
            read_at = coalesce(read_at, now()),
            status = case when status = 'active' then 'acknowledged' else status end,
            updated_at = now()
      where id = $1 and tenant_id = $2
      returning *`,
    [id, tenantId]
  )
  return rows[0] ?? null
}

export async function markCredentialCooldown(ctx, { tenantId, credentialId, provider, seconds, reason, apiKeyId }) {
  if (!credentialId) return null
  const cooldownUntil = new Date(Date.now() + seconds * 1000).toISOString()
  const { rows } = await ctx.db.query(
    `update public.provider_credentials
        set status = 'cooldown',
            cooldown_until = $2,
            failed_requests = failed_requests + 1
      where id = $1
      returning id, provider_name, cooldown_until`,
    [credentialId, cooldownUntil]
  )
  if (!rows[0]) return null
  gatewayCredentialCooldownsTotal.inc({ tenant_id: tenantId, provider })
  await createAlert(ctx, {
    tenantId,
    severity: reason === "provider_rate_limit" ? "warning" : "critical",
    category: "credential_cooldown_started",
    title: `Credential ${provider} cooldown`,
    message: `Credential ${provider} masuk cooldown sampai ${new Date(cooldownUntil).toLocaleTimeString("id-ID")}.`,
    provider,
    apiKeyId,
    credentialId,
    dedupeKey: `cooldown:${credentialId}:${reason}`,
    metadata: { reason, cooldown_until: cooldownUntil },
  })
  ctx.ws.broadcastToTenant?.(tenantId, {
    type: "credential.cooldown",
    tenantId,
    at: Date.now(),
    provider,
    credentialId,
    cooldownUntil,
    reason,
  })
  return rows[0]
}

async function maybeAutoRotateApiKey(ctx, event, leakRisk) {
  if (!event.apiKeyId || !event.apiKeyKeyHash || leakRisk !== "critical") return null
  const rotateLock = await ctx.redis.set(`obs:rotate-lock:${event.apiKeyId}`, "1", { NX: true, EX: 300 })
  if (!rotateLock) return null
  const rotated = await rotateApiKey(
    { db: ctx.db, l1: ctx.l1, l2: ctx.l2, redis: ctx.redis },
    { apiKeyId: event.apiKeyId, tenantId: event.tenantId, oldKeyHash: event.apiKeyKeyHash }
  ).catch(() => null)
  if (!rotated) return null
  apiKeyRotations.inc({ tenant_id: event.tenantId })
  gatewayAutoRotationsTotal.inc({ tenant_id: event.tenantId, reason: "possible_api_key_leak" })
  await createAlert(ctx, {
    tenantId: event.tenantId,
    severity: "critical",
    category: "auto_rotation_executed",
    title: "API key dirotasi otomatis",
    message: `Gateway API key untuk ${event.provider} dirotasi otomatis karena terdeteksi pola kebocoran atau burst tidak wajar.`,
    provider: event.provider,
    apiKeyId: rotated.id,
    credentialId: event.credentialId,
    dedupeKey: `auto-rotate:${event.apiKeyId}`,
    metadata: { old_api_key_id: event.apiKeyId, new_api_key_id: rotated.id },
  })
  ctx.ws.broadcastToTenant?.(event.tenantId, {
    type: "api_key.auto_rotated",
    tenantId: event.tenantId,
    at: Date.now(),
    oldApiKeyId: event.apiKeyId,
    newApiKeyId: rotated.id,
    reason: "possible_api_key_leak",
  })
  return rotated
}

export async function logGatewayRequest(ctx, event) {
  const errorType = classifyErrorType({
    statusCode: event.statusCode,
    errorMessage: event.errorMessage,
    rateLimited: event.rateLimited,
  })
  const baseMetadata = event.metadata ?? {}
  const { rows } = await ctx.db.query(
    `insert into public.gateway_request_logs
      (api_key_id, tenant_id, provider, method, status_code, response_time_ms, origin_domain, request_path, error_type, error_message, credential_id, client_auth_used, rate_limited, breaker_open, upstream_status, detected_anomaly_types, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     returning *`,
    [
      event.apiKeyId,
      event.tenantId,
      event.provider,
      event.method,
      event.statusCode ?? null,
      event.responseTimeMs ?? null,
      event.originDomain ?? null,
      event.requestPath ?? null,
      errorType,
      trimMessage(event.errorMessage),
      event.credentialId ?? null,
      !!event.clientAuthUsed,
      !!event.rateLimited,
      !!event.breakerOpen,
      event.upstreamStatus ?? null,
      [],
      toJson(baseMetadata),
    ]
  )
  const logRow = rows[0]
  await upsertProviderCredentialStats(ctx.db, { credentialId: event.credentialId, success: !event.statusCode || event.statusCode < 400 })

  const anomalyTypes = []
  const alerts = []
  const burstCount = await ctx.redis.incr(`obs:burst:${event.apiKeyId}`)
  if (burstCount === 1) await ctx.redis.expire(`obs:burst:${event.apiKeyId}`, 5)
  const recentApiKeyStats = await getRecentApiKeyStats(ctx.db, { apiKeyId: event.apiKeyId })

  if (burstCount >= BURST_THRESHOLD_WARNING) {
    pushUnique(anomalyTypes, "burst_traffic")
    gatewayAnomaliesTotal.inc({ tenant_id: event.tenantId, type: "burst_traffic" })
    alerts.push(await createAlert(ctx, {
      tenantId: event.tenantId,
      severity: burstCount >= BURST_THRESHOLD_CRITICAL ? "critical" : "warning",
      category: "burst_traffic",
      title: "Lonjakan request terdeteksi",
      message: `API key menerima ${burstCount} request dalam 5 detik terakhir.`,
      provider: event.provider,
      apiKeyId: event.apiKeyId,
      credentialId: event.credentialId,
      dedupeKey: `burst:${event.apiKeyId}`,
      metadata: { burst_count: burstCount, recent_requests: recentApiKeyStats.requests },
    }))
  }

  const leakRisk = detectLeakRisk({
    burstCount,
    distinctDomains: recentApiKeyStats.domains,
    recentRequests: recentApiKeyStats.requests,
  })
  if (leakRisk) {
    pushUnique(anomalyTypes, "possible_api_key_leak")
    gatewayAnomaliesTotal.inc({ tenant_id: event.tenantId, type: "possible_api_key_leak" })
    alerts.push(await createAlert(ctx, {
      tenantId: event.tenantId,
      severity: leakRisk === "critical" ? "critical" : "warning",
      category: "possible_api_key_leak",
      title: "Indikasi API key bocor",
      message: `Aktivitas tidak wajar terdeteksi untuk API key ini dari ${recentApiKeyStats.domains} domain dalam 10 menit terakhir.`,
      provider: event.provider,
      apiKeyId: event.apiKeyId,
      credentialId: event.credentialId,
      dedupeKey: `leak:${event.apiKeyId}`,
      metadata: { distinct_domains: recentApiKeyStats.domains, burst_count: burstCount, recent_requests: recentApiKeyStats.requests },
    }))
  }

  if (errorType !== "success") {
    const providerStats = await getProviderErrorStats(ctx.db, { tenantId: event.tenantId, provider: event.provider })
    if (providerStats.errors >= PROVIDER_INCIDENT_THRESHOLD) {
      pushUnique(anomalyTypes, "provider_incident")
      gatewayAnomaliesTotal.inc({ tenant_id: event.tenantId, type: "provider_incident" })
      alerts.push(await createAlert(ctx, {
        tenantId: event.tenantId,
        severity: providerStats.errors >= PROVIDER_OUTAGE_THRESHOLD ? "critical" : "warning",
        category: "provider_incident",
        title: `Insiden provider ${event.provider}`,
        message: `${providerStats.errors} error terdeteksi pada provider ${event.provider} dalam 2 menit terakhir.`,
        provider: event.provider,
        apiKeyId: event.apiKeyId,
        credentialId: event.credentialId,
        dedupeKey: `incident:${event.tenantId}:${event.provider}`,
        metadata: providerStats,
      }))
    }

    const remediation = getRemediationPolicy({ errorType, anomalyTypes })
    if (remediation === "cooldown_credential" && event.credentialId) {
      const seconds = errorType === "provider_rate_limit" ? RATE_LIMIT_COOLDOWN_SECONDS : OUTAGE_COOLDOWN_SECONDS
      await markCredentialCooldown(ctx, {
        tenantId: event.tenantId,
        credentialId: event.credentialId,
        provider: event.provider,
        seconds,
        reason: errorType,
        apiKeyId: event.apiKeyId,
      })
      pushUnique(anomalyTypes, "credential_cooldown")
      const availability = await getProviderAvailability(ctx.db, { userId: event.tenantId, provider: event.provider })
      if (availability.total > 0 && availability.active === 0) {
        pushUnique(anomalyTypes, "all_credentials_unavailable")
        alerts.push(await createAlert(ctx, {
          tenantId: event.tenantId,
          severity: "critical",
          category: "all_credentials_unavailable",
          title: `Semua credential ${event.provider} tidak tersedia`,
          message: `Semua credential ${event.provider} sedang cooldown atau tidak bisa dipakai.`,
          provider: event.provider,
          apiKeyId: event.apiKeyId,
          credentialId: event.credentialId,
          dedupeKey: `all-down:${event.tenantId}:${event.provider}`,
          metadata: availability,
        }))
      }
    }

    if (remediation === "rotate_api_key") {
      await maybeAutoRotateApiKey(ctx, event, leakRisk)
    }
  }

  if (anomalyTypes.length > 0) {
    await ctx.db.query(
      `update public.gateway_request_logs
          set detected_anomaly_types = $2
        where id = $1`,
      [logRow.id, anomalyTypes]
    ).catch(() => {})
  }

  return { log: { ...logRow, detected_anomaly_types: anomalyTypes }, anomalyTypes, alerts }
}

export async function listGatewayLogs(db, { tenantId, limit = 100, provider, apiKeyId, status, search, from, to }) {
  const params = [tenantId]
  const where = ["g.tenant_id = $1"]
  if (provider) {
    params.push(provider)
    where.push(`g.provider = $${params.length}`)
  }
  if (apiKeyId) {
    params.push(apiKeyId)
    where.push(`g.api_key_id = $${params.length}`)
  }
  if (status === "success") where.push("coalesce(g.status_code, 0) < 400")
  if (status === "error") where.push("coalesce(g.status_code, 0) >= 400")
  if (from) {
    params.push(from)
    where.push(`g.created_at >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    where.push(`g.created_at <= $${params.length}`)
  }
  if (search) {
    params.push(`%${search}%`)
    where.push(`(
      coalesce(g.error_message, '') ilike $${params.length}
      or coalesce(g.origin_domain, '') ilike $${params.length}
      or coalesce(g.request_path, '') ilike $${params.length}
      or coalesce(k.name, '') ilike $${params.length}
    )`)
  }
  params.push(Math.min(Number(limit) || 100, 500))
  const { rows } = await db.query(
    `select g.id, g.provider as provider_name, 'gateway' as provider_type,
            g.request_path as endpoint, g.method, g.status_code, g.response_time_ms,
            g.error_message, g.error_type, g.origin_domain, g.request_path,
            g.detected_anomaly_types, g.created_at, g.api_key_id, g.credential_id,
            k.name as api_key_name
       from public.gateway_request_logs g
       left join public.api_keys k on k.id = g.api_key_id
      where ${where.join(" and ")}
      order by g.created_at desc
      limit $${params.length}`,
    params
  )
  return rows
}

export async function listGatewayAlerts(db, { tenantId, status = "active", limit = 25 }) {
  const params = [tenantId]
  const where = ["tenant_id = $1"]
  if (status && status !== "all") {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  params.push(Math.min(Number(limit) || 25, 100))
  const { rows } = await db.query(
    `select *
       from public.gateway_alerts
      where ${where.join(" and ")}
      order by created_at desc
      limit $${params.length}`,
    params
  )
  return rows.map((row) => ({ ...row, metadata: parseJsonSafely(row.metadata, {}) }))
}

export async function getMonitoringOverview(db, { tenantId }) {
  const [requestRows, alertRows, providerRows, keyRows] = await Promise.all([
    db.query(
      `select
          count(*)::int as total_requests,
          count(*) filter (where status_code >= 400)::int as total_errors,
          coalesce(avg(response_time_ms), 0)::int as avg_latency_ms
         from public.gateway_request_logs
        where tenant_id = $1 and created_at >= now() - interval '24 hours'`,
      [tenantId]
    ),
    db.query(
      `select
          count(*) filter (where status = 'active')::int as active_alerts,
          count(*) filter (where severity = 'critical' and status = 'active')::int as critical_alerts
         from public.gateway_alerts
        where tenant_id = $1 and created_at >= now() - interval '7 days'`,
      [tenantId]
    ),
    db.query(
      `select provider_name as provider,
              count(*)::int as total_credentials,
              count(*) filter (where status = 'active')::int as active_credentials,
              count(*) filter (where status = 'cooldown')::int as cooldown_credentials
         from public.provider_credentials
        where user_id = $1
        group by provider_name
        order by provider_name`,
      [tenantId]
    ),
    db.query(
      `select g.api_key_id, coalesce(k.name, 'Unnamed') as api_key_name,
              count(*)::int as requests,
              count(*) filter (where g.status_code >= 400)::int as errors,
              count(distinct g.origin_domain) filter (where g.origin_domain is not null and g.origin_domain <> '')::int as domains
         from public.gateway_request_logs g
         left join public.api_keys k on k.id = g.api_key_id
        where g.tenant_id = $1 and g.created_at >= now() - interval '24 hours'
        group by g.api_key_id, k.name
        order by requests desc
        limit 5`,
      [tenantId]
    ),
  ])

  return {
    totals: {
      totalRequests24h: Number(requestRows.rows[0]?.total_requests ?? 0),
      totalErrors24h: Number(requestRows.rows[0]?.total_errors ?? 0),
      avgLatencyMs24h: Number(requestRows.rows[0]?.avg_latency_ms ?? 0),
      activeAlerts: Number(alertRows.rows[0]?.active_alerts ?? 0),
      criticalAlerts: Number(alertRows.rows[0]?.critical_alerts ?? 0),
    },
    providerHealth: providerRows.rows,
    noisyKeys: keyRows.rows,
  }
}

export async function getApiKeyAnalytics(db, { tenantId, apiKeyId }) {
  const [summaryRows, seriesRows, alertRows] = await Promise.all([
    db.query(
      `select
          count(*)::int as requests,
          count(*) filter (where status_code >= 400)::int as errors,
          coalesce(avg(response_time_ms), 0)::int as avg_latency_ms,
          count(distinct origin_domain) filter (where origin_domain is not null and origin_domain <> '')::int as domains
         from public.gateway_request_logs
        where tenant_id = $1 and api_key_id = $2 and created_at >= now() - interval '7 days'`,
      [tenantId, apiKeyId]
    ),
    db.query(
      `select date_trunc('hour', created_at at time zone 'UTC') as bucket,
              count(*)::int as requests,
              count(*) filter (where status_code >= 400)::int as errors,
              coalesce(avg(response_time_ms), 0)::int as avg_latency_ms
         from public.gateway_request_logs
        where tenant_id = $1 and api_key_id = $2 and created_at >= now() - interval '24 hours'
        group by 1
        order by 1`,
      [tenantId, apiKeyId]
    ),
    db.query(
      `select *
         from public.gateway_alerts
        where tenant_id = $1 and api_key_id = $2
        order by created_at desc
        limit 10`,
      [tenantId, apiKeyId]
    ),
  ])
  return {
    summary: {
      requests: Number(summaryRows.rows[0]?.requests ?? 0),
      errors: Number(summaryRows.rows[0]?.errors ?? 0),
      avgLatencyMs: Number(summaryRows.rows[0]?.avg_latency_ms ?? 0),
      domains: Number(summaryRows.rows[0]?.domains ?? 0),
    },
    series: seriesRows.rows,
    alerts: alertRows.rows.map((row) => ({ ...row, metadata: parseJsonSafely(row.metadata, {}) })),
  }
}
