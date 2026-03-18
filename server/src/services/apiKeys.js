import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";

export const hashApiKey = (plain) => createHash("sha256").update(plain).digest("hex");
const API_KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const API_KEY_NEGATIVE_TTL_MS = 30 * 1000;
const CACHE_MISS_MARKER = { __cacheMiss: true };

const API_KEY_PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  cloudinary: "Cloudinary",
  imagekit: "ImageKit",
  apify: "Apify",
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getApiKeyBaseName = (allowedProviders) => {
  if (Array.isArray(allowedProviders) && allowedProviders.length === 1) {
    const provider = String(allowedProviders[0] ?? "").trim().toLowerCase();
    if (provider && API_KEY_PROVIDER_LABELS[provider]) return API_KEY_PROVIDER_LABELS[provider];
  }
  return "API Key";
};

const getNextApiKeyName = async (db, tenantId, allowedProviders) => {
  const baseName = getApiKeyBaseName(allowedProviders);
  const { rows } = await db.query(
    "select name from public.api_keys where tenant_id = $1 and name is not null",
    [tenantId]
  );
  const matcher = new RegExp(`^${escapeRegExp(baseName)}\\s+(\\d+)$`, "i");
  let maxNumber = 0;
  for (const row of rows) {
    const currentName = String(row?.name ?? "").trim();
    const match = matcher.exec(currentName);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value;
  }
  return `${baseName} ${maxNumber + 1}`;
};

export const generateApiKey = (tenantId, prefix = "eka") => {
  const tenantPart = tenantId.replace(/-/g, "").slice(0, 6);
  const bytes = randomBytes(8);
  const secret = bytes.toString("base64url"); // pendek, tapi tetap random
  return `${prefix}_${tenantPart}_${secret}`;
};

export const ensureApiKeySchema = async (db) => {
  await db.query(
    `create table if not exists public.api_keys (
      id uuid not null default gen_random_uuid() primary key,
      tenant_id uuid not null,
      key_hash text not null unique,
      api_key_plain text,
      status text not null default 'active',
      grace_until timestamp with time zone,
      rotated_from uuid references public.api_keys(id) on delete set null,
      quota_per_minute integer not null default 1000,
      allowed_providers text[] default '{}',
      name text,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now()
    )`
  );
  await db.query(`alter table public.api_keys add column if not exists allowed_providers text[] default '{}'`);
  await db.query(`alter table public.api_keys add column if not exists name text`);
  await db.query(`alter table public.api_keys add column if not exists api_key_plain text`);
  await db.query(`alter table public.api_keys add column if not exists client_username text`);
  await db.query(`alter table public.api_keys add column if not exists client_password_hash text`);
  await db.query(
    `create index if not exists idx_api_keys_tenant on public.api_keys(tenant_id, created_at desc)`
  );
  await db.query(
    `create index if not exists idx_api_keys_hash on public.api_keys(key_hash)`
  );
  await db.query(
    `create table if not exists public.gateway_request_logs (
      id uuid not null default gen_random_uuid() primary key,
      api_key_id uuid not null references public.api_keys(id) on delete cascade,
      tenant_id uuid not null references public.users(id) on delete cascade,
      provider text not null,
      method text not null default 'GET',
      status_code integer,
      response_time_ms integer,
      origin_domain text,
      created_at timestamp with time zone not null default now()
    )`
  );
  await db.query(`create index if not exists idx_gateway_logs_api_key_created on public.gateway_request_logs(api_key_id, created_at desc)`);
  await db.query(`create index if not exists idx_gateway_logs_tenant_created on public.gateway_request_logs(tenant_id, created_at desc)`);
};

export const createApiKey = async (db, { tenantId, quotaPerMinute, allowedProviders, name, clientUsername, clientPassword }) => {
  const plain = generateApiKey(tenantId);
  const keyHash = hashApiKey(plain);
  const providers = Array.isArray(allowedProviders) ? allowedProviders : [];
  const rawName = name != null ? String(name).trim() : "";
  const keyName = rawName || await getNextApiKeyName(db, tenantId, providers);
  let clientUser = null;
  let clientHash = null;
  if (clientUsername != null && String(clientUsername).trim() && clientPassword != null && String(clientPassword)) {
    clientUser = String(clientUsername).trim();
    clientHash = await bcrypt.hash(String(clientPassword), 10);
  }
  const { rows } = await db.query(
    "insert into public.api_keys (tenant_id, key_hash, quota_per_minute, allowed_providers, name, client_username, client_password_hash) values ($1, $2, $3, $4, $5, $6, $7) returning id, tenant_id, status, quota_per_minute, allowed_providers, name, created_at, client_username",
    [tenantId, keyHash, quotaPerMinute ?? 1000, providers, keyName, clientUser, clientHash]
  );
  return { ...rows[0], api_key: plain };
};

export const listApiKeys = async (db, { tenantId }) => {
  const { rows } = await db.query(
    "select id, tenant_id, status, grace_until, rotated_from, quota_per_minute, allowed_providers, name, created_at, client_username from public.api_keys where tenant_id = $1 order by created_at desc",
    [tenantId]
  );
  return rows;
};

// Cached get with L1 -> local L2 -> DB
export const getApiKey = async ({ db, l1, l2 }, keyHash) => {
  // 1. L1 Cache
  const l1Key = `apikey:${keyHash}`;
  const l1Hit = l1.get(l1Key);
  if (l1Hit) return l1Hit.__cacheMiss ? null : l1Hit;

  // 2. L2 Cache
  const l2Hit = await l2.getJson(l1Key);
  if (l2Hit) {
    l1.set(l1Key, l2Hit, l2Hit.__cacheMiss ? API_KEY_NEGATIVE_TTL_MS : API_KEY_CACHE_TTL_MS);
    return l2Hit.__cacheMiss ? null : l2Hit;
  }

  // 3. DB (include client_username and client_password_hash for gateway Basic Auth check)
  const { rows } = await db.query(
    "select id, tenant_id, key_hash, status, grace_until, rotated_from, quota_per_minute, allowed_providers, name, client_username, client_password_hash from public.api_keys where key_hash = $1 limit 1",
    [keyHash]
  );
  const apiKey = rows[0] ?? null;

  if (apiKey) {
    l1.set(l1Key, apiKey, API_KEY_CACHE_TTL_MS);
    await l2.setJson(l1Key, apiKey, API_KEY_CACHE_TTL_MS);
  } else {
    l1.set(l1Key, CACHE_MISS_MARKER, API_KEY_NEGATIVE_TTL_MS);
    await l2.setJson(l1Key, CACHE_MISS_MARKER, API_KEY_NEGATIVE_TTL_MS);
  }

  return apiKey;
};

export const disableApiKey = async (db, { id, tenantId, graceUntil }) => {
  const { rowCount } = await db.query(
    "update public.api_keys set status = 'disabled', grace_until = $1 where id = $2 and tenant_id = $3",
    [graceUntil, id, tenantId]
  );
  return rowCount > 0;
};

export const rotateApiKey = async ({ db, l1, l2 }, { apiKeyId, tenantId, oldKeyHash }) => {
  const graceUntil = new Date(Date.now() + config.apiKeyGraceMs).toISOString();
  
  const { rows: oldRows } = await db.query(
    "select allowed_providers, name from public.api_keys where id = $1 and tenant_id = $2",
    [apiKeyId, tenantId]
  );
  const allowedProviders = oldRows[0]?.allowed_providers ?? [];
  const name = oldRows[0]?.name ?? null;

  // Disable old key
  await db.query(
    "update public.api_keys set status = 'disabled', grace_until = $1 where id = $2 and tenant_id = $3",
    [graceUntil, apiKeyId, tenantId]
  );
  
  // Create new key (inherit allowed_providers and name)
  const created = await createApiKey(db, { tenantId, allowedProviders, name });
  
  // Link rotation
  await db.query("update public.api_keys set rotated_from = $1 where id = $2", [apiKeyId, created.id]);
  
  // Invalidate caches for old key
  if (oldKeyHash) {
    const l1Key = `apikey:${oldKeyHash}`;
    l1.delete(l1Key);
    await l2.delete(l1Key);
  }

  return { ...created, grace_until: graceUntil };
};

export const trackApiKeyError = async ({ db, l1, l2, ws }, { apiKeyId, tenantId, keyHash }) => {
  const errorKey = `apikey:errors:${apiKeyId}`;
  const existing = Number(l1.get(errorKey) ?? 0);
  const count = existing + 1;
  l1.set(errorKey, count, 5_000);

  if (count > 3) {
    try {
      const newKey = await rotateApiKey({ db, l1, l2 }, { apiKeyId, tenantId, oldKeyHash: keyHash });
      
      if (ws) {
        ws.broadcastToTenant?.(tenantId, { 
          type: "api_key.auto_rotated", 
          at: Date.now(), 
          tenantId, 
          oldApiKeyId: apiKeyId, 
          newApiKeyId: newKey.id 
        });
      }
      
      return newKey;
    } catch (e) {
      console.error("Failed to auto-rotate key", e);
    }
  }
  return null;
};

