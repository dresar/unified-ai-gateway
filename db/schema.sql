-- Schema dasar untuk unified-ai-gateway. Idempotent: create if not exists.
-- Tabel api_keys dan gateway_request_logs dibuat di ensureApiKeySchema (apiKeys.js).
-- Tabel ai_models dibuat di ensureAiModelsSchema (aiModels.js).

-- Users (login dashboard + tenant untuk API key)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text,
  display_name text,
  hmac_secret text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Provider credentials (Gemini, Groq, Cloudinary, ImageKit, dll.)
CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'ai',
  label text,
  credentials jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  total_requests bigint NOT NULL DEFAULT 0,
  failed_requests bigint NOT NULL DEFAULT 0,
  cooldown_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_user ON public.provider_credentials(user_id, created_at DESC);

-- API clients (halaman Clients; berbeda dari api_keys yang dipakai gateway)
CREATE TABLE IF NOT EXISTS public.api_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Unnamed',
  api_key text,
  is_active boolean NOT NULL DEFAULT true,
  rate_limit integer NOT NULL DEFAULT 100,
  allowed_providers text[] DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_clients_user ON public.api_clients(user_id, created_at DESC);

-- Request logs (dashboard overview)
CREATE TABLE IF NOT EXISTS public.request_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_created ON public.request_logs(user_id, created_at DESC);

-- System settings per user (key-value)
CREATE TABLE IF NOT EXISTS public.system_settings (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value text,
  PRIMARY KEY (user_id, setting_key)
);

-- Upload expiry: jadwal hapus file Cloudinary/ImageKit (playground = 1 jam, API client = dari setting)
CREATE TABLE IF NOT EXISTS public.upload_expiry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.provider_credentials(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  delete_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upload_expiry_delete_at ON public.upload_expiry(delete_at);
