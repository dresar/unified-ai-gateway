
-- Create enum types
CREATE TYPE public.provider_type AS ENUM ('ai', 'media', 'automation');
CREATE TYPE public.credential_status AS ENUM ('active', 'cooldown', 'disabled');

-- Create update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table for admin users
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- API Clients table
CREATE TABLE public.api_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('gw_' || encode(gen_random_bytes(32), 'hex')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit INTEGER NOT NULL DEFAULT 100,
  allowed_providers TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own api_clients" ON public.api_clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own api_clients" ON public.api_clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api_clients" ON public.api_clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api_clients" ON public.api_clients FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_api_clients_updated_at BEFORE UPDATE ON public.api_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Provider Credentials table
CREATE TABLE public.provider_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_type public.provider_type NOT NULL,
  label TEXT,
  credentials JSONB NOT NULL DEFAULT '{}',
  status public.credential_status NOT NULL DEFAULT 'active',
  cooldown_until TIMESTAMP WITH TIME ZONE,
  total_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credentials" ON public.provider_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credentials" ON public.provider_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credentials" ON public.provider_credentials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own credentials" ON public.provider_credentials FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_provider_credentials_updated_at BEFORE UPDATE ON public.provider_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Request Logs table
CREATE TABLE public.request_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_client_id UUID REFERENCES public.api_clients(id) ON DELETE SET NULL,
  credential_id UUID REFERENCES public.provider_credentials(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  provider_type public.provider_type NOT NULL,
  endpoint TEXT,
  method TEXT NOT NULL DEFAULT 'POST',
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own logs" ON public.request_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON public.request_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_request_logs_created_at ON public.request_logs(created_at DESC);
CREATE INDEX idx_request_logs_provider ON public.request_logs(provider_name);

-- System Settings table
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, setting_key)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON public.system_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.system_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.system_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
