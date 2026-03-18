import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Loader2, Send, CloudUpload, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface GatewayKey {
  id: string;
  name?: string | null;
  allowed_providers?: string[];
  api_key_plain?: string | null;
  client_username?: string | null;
}

const AI_PROVIDERS = [
  { id: "gemini", label: "Gemini" },
  { id: "groq", label: "Groq" },
];

const CLOUD_PROVIDERS = [
  { id: "cloudinary", label: "Cloudinary" },
  { id: "imagekit", label: "ImageKit" },
];

function getDefaultBaseUrl(): string {
  if (import.meta.env.VITE_GATEWAY_URL) return import.meta.env.VITE_GATEWAY_URL;
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) return apiBase;
  return "";
}

const TestApiKeyPage = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState<GatewayKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [manualApiKey, setManualApiKey] = useState("");
  const [testType, setTestType] = useState<"ai" | "cloud">("ai");
  const [provider, setProvider] = useState("gemini");
  const [baseUrl, setBaseUrl] = useState(() => getDefaultBaseUrl());
  const [authHeader, setAuthHeader] = useState<"x-api-key" | "bearer">("x-api-key");
  const [cloudFile, setCloudFile] = useState<File | null>(null);
  const [clientUsername, setClientUsername] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [authVerifiedAt, setAuthVerifiedAt] = useState<number | null>(null);
  const [cekAuthLoading, setCekAuthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    status?: number;
    latencyMs?: number;
    body: string;
    ok: boolean;
    cdnUrl?: string | null;
    answer?: string | null;
  } | null>(null);

  const MAX_CLOUD_FILE_MB = 10;
  const isValidUrl = (s: string): boolean => {
    if (!s.trim()) return true;
    try {
      new URL(s.startsWith("http") ? s : `https://${s}`);
      return true;
    } catch {
      return false;
    }
  };

  type ValidateFor = "all" | "ai" | "cloud" | "cekAuth";
  const validate = (forAction: ValidateFor): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!effectiveKey.trim()) e.apiKey = "Pilih API key atau paste manual.";
    if (keyRequiresClientAuth) {
      if (!clientUsername.trim()) e.clientUsername = "Username wajib (min 1 karakter).";
      if (!clientPassword) e.clientPassword = "Password wajib.";
    }
    if (baseUrl.trim() && !isValidUrl(baseUrl.trim())) e.baseUrl = "Base URL harus format URL yang valid.";
    if (forAction === "cloud" || forAction === "all") {
      if (testType === "cloud") {
        if (!cloudFile) e.cloudFile = "Pilih file (gambar atau video).";
        else if (cloudFile.size > MAX_CLOUD_FILE_MB * 1024 * 1024)
          e.cloudFile = `Maksimal ${MAX_CLOUD_FILE_MB} MB.`;
        else if (!/^image\/|^video\//.test(cloudFile.type || ""))
          e.cloudFile = "Tipe file harus gambar atau video.";
      }
    }
    return e;
  };

  useEffect(() => {
    if (!user) return;
    setKeysLoading(true);
    apiFetch<GatewayKey[]>("/api/dashboard/keys")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setKeys(list);
        if (list.length === 1) {
          setSelectedKeyId(list[0].id);
          if (list[0].api_key_plain) setManualApiKey(list[0].api_key_plain);
        } else {
          setSelectedKeyId("");
        }
      })
      .catch(() => toast.error("Gagal memuat daftar API key"))
      .finally(() => setKeysLoading(false));
  }, [user]);

  useEffect(() => {
    if (keys.length > 0 && selectedKeyId && !keys.some((k) => k.id === selectedKeyId)) {
      setSelectedKeyId("");
      setManualApiKey("");
    }
  }, [keys, selectedKeyId]);

  useEffect(() => {
    if (!selectedKeyId || typeof sessionStorage === "undefined") {
      setAuthVerifiedAt(null);
      return;
    }
    const raw = sessionStorage.getItem(`auth_verified_${selectedKeyId}`);
    if (raw) {
      const t = Number(raw);
      setAuthVerifiedAt(Number.isFinite(t) ? t : null);
    } else {
      setAuthVerifiedAt(null);
    }
    const savedUser = sessionStorage.getItem(`auth_username_${selectedKeyId}`);
    if (savedUser) setClientUsername(savedUser);
  }, [selectedKeyId]);

  const selectedKey = selectedKeyId ? keys.find((k) => k.id === selectedKeyId) : null;
  const allowedProviders = selectedKey?.allowed_providers ?? [];

  // Provider otomatis: pakai yang pertama dari allowed_providers key, atau default gemini
  useEffect(() => {
    if (allowedProviders.length > 0) {
      setProvider((prev) => (allowedProviders.includes(prev) ? prev : allowedProviders[0]));
    } else {
      setProvider("gemini");
    }
  }, [selectedKeyId, allowedProviders.join(",")]);

  // Sinkronkan tampilan API key: saat ganti key dari dropdown, isi kolom manual dengan api_key_plain key tersebut
  useEffect(() => {
    if (selectedKey?.api_key_plain?.trim()) {
      setManualApiKey(selectedKey.api_key_plain.trim());
    }
  }, [selectedKeyId, selectedKey?.api_key_plain]);
  const effectiveKey = (selectedKey?.api_key_plain?.trim() || manualApiKey.trim()).trim();
  const keyRequiresClientAuth = !!(selectedKey?.client_username);
  const hasClientAuthFilled = !!(clientUsername.trim() && clientPassword);

  const getRequestHeaders = (): Record<string, string> => {
    const key = effectiveKey;
    const headers: Record<string, string> = {};
    if (keyRequiresClientAuth || hasClientAuthFilled) {
      headers["x-api-key"] = key;
      if (clientUsername.trim() && clientPassword) {
        headers["Authorization"] = `Basic ${btoa(`${clientUsername.trim()}:${clientPassword}`)}`;
      }
    } else {
      if (authHeader === "bearer") {
        headers["Authorization"] = `Bearer ${key}`;
      } else {
        headers["x-api-key"] = key;
      }
    }
    return headers;
  };

  const base = baseUrl.trim().replace(/\/$/, "");
  const currentValidationErrors = testType === "ai" ? validate("ai") : validate("cloud");

  const handleCekAuth = async () => {
    const e = validate("cekAuth");
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const url = base ? `${base}/gateway/verify` : "/gateway/verify";
    setCekAuthLoading(true);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: getRequestHeaders(),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (data.ok) {
          toast.success("Auth valid");
          if (selectedKeyId && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(`auth_verified_${selectedKeyId}`, String(Date.now()));
            sessionStorage.setItem(`auth_username_${selectedKeyId}`, clientUsername.trim());
          }
          setAuthVerifiedAt(Date.now());
        } else {
          toast.error("Response tidak valid");
        }
      } else {
        const text = await res.text();
        let msg = `Auth gagal (${res.status})`;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          if (text) msg = text.slice(0, 200);
        }
        toast.error(msg);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal cek auth");
    } finally {
      setCekAuthLoading(false);
    }
  };

  const handleSendAi = async () => {
    const e = validate("ai");
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      toast.error("Provider tidak diizinkan untuk key ini");
      return;
    }
    if (keyRequiresClientAuth && (!clientUsername.trim() || !clientPassword)) {
      toast.error("Key ini butuh Client username dan password");
      return;
    }
    setLoading(true);
    setResult(null);
    const start = performance.now();
    const url = base ? `${base}/gateway/${provider}/chat` : `/gateway/${provider}/chat`;
    const headers = getRequestHeaders();
    headers["Content-Type"] = "application/json";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: aiPrompt || "Halo" }),
      });
      const latencyMs = Math.round(performance.now() - start);
      const text = await res.text();
      let body = text;
      let answer: string | null = null;
      try {
        const parsed = JSON.parse(text);
        body = JSON.stringify(parsed, null, 2);
        if (parsed.text != null) answer = String(parsed.text);
      } catch {
        // keep raw
      }
      setResult({ status: res.status, latencyMs, body, ok: res.ok, answer });
      if (res.ok) {
        toast.success(`Berhasil — ${res.status} (${latencyMs} ms)`);
      } else {
        try {
          const errBody = JSON.parse(text);
          const msg = errBody?.error || text?.slice(0, 80) || `Error ${res.status}`;
          toast.error(msg);
        } catch {
          toast.error(`Error ${res.status}`);
        }
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : "Request gagal";
      setResult({
        latencyMs,
        body: `Error: ${message}\n\nPastikan Base URL benar (kosongkan untuk pakai origin saat ini) dan CORS mengizinkan.`,
        ok: false,
      });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCloud = async () => {
    const e = validate("cloud");
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      toast.error("Provider tidak diizinkan untuk key ini");
      return;
    }
    setLoading(true);
    setResult(null);
    const start = performance.now();
    const uploadUrl = base ? `${base}/gateway/${provider}/upload` : `/gateway/${provider}/upload`;
    const headers = getRequestHeaders();
    const form = new FormData();
    form.append("file", cloudFile);
    try {
      const res = await fetch(uploadUrl, { method: "POST", headers, body: form });
      const latencyMs = Math.round(performance.now() - start);
      const text = await res.text();
      let body = text;
      let cdnUrl: string | null = null;
      try {
        const parsed = JSON.parse(text);
        body = JSON.stringify(parsed, null, 2);
        if (parsed.cdn_url) cdnUrl = parsed.cdn_url;
        else if (parsed.url) cdnUrl = parsed.url;
        else if (parsed.secure_url) cdnUrl = parsed.secure_url;
      } catch {
        // keep raw
      }
      setResult({ status: res.status, latencyMs, body, ok: res.ok, cdnUrl });
      if (res.ok) {
        toast.success("Upload berhasil");
        if (cdnUrl) toast.success("URL CDN tersedia di bawah");
      } else {
        try {
          const errBody = JSON.parse(text);
          toast.error(errBody?.error || `Error ${res.status}`);
        } catch {
          toast.error(`Error ${res.status}`);
        }
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : "Request gagal";
      setResult({
        latencyMs,
        body: `Error: ${message}`,
        ok: false,
      });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Tes API Key"
        description="Pilih key dari halaman Clients, pilih tipe tes (AI atau Cloud), lalu kirim"
      />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Pilih API Key & Tipe Tes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key (dari halaman Clients)</Label>
            <p className="text-xs text-muted-foreground">
              Daftar ini diambil dari `Gateway API Keys` di halaman Clients, bukan dari credential provider di halaman Credentials.
              Jika yang muncul hanya ImageKit, berarti gateway key untuk Gemini/Groq/Cloudinary belum dibuat meski credential provider-nya sudah ada.
            </p>
            {keysLoading ? (
              <p className="text-sm text-muted-foreground">Memuat daftar...</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada API key. Buat di halaman Clients.</p>
            ) : (
              <Select
                value={selectedKeyId}
                onValueChange={(v) => {
                  setSelectedKeyId(v);
                  setErrors((prev) => ({ ...prev, apiKey: "" }));
                  const k = keys.find((x) => x.id === v);
                  if (k?.api_key_plain) setManualApiKey(k.api_key_plain);
                }}
              >
                <SelectTrigger className="border-border">
                  <SelectValue placeholder="Pilih API key" />
                </SelectTrigger>
                <SelectContent>
                  {keys.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name || `Key ${k.id.slice(0, 8)}`} ({(k.allowed_providers ?? []).length ? (k.allowed_providers ?? []).join(", ") : "semua"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedKey && !selectedKey.api_key_plain && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Key ini tidak tersimpan di server. Paste manual di bawah atau buat key baru di Clients.
              </p>
            )}
            {errors.apiKey && <p className="text-xs text-destructive">{errors.apiKey}</p>}
          </div>
          <div className="space-y-2">
            <Label>API Key (tampil — paste manual jika perlu)</Label>
            <Input
              type="text"
              placeholder="Paste API key atau pilih dari dropdown di atas"
              value={manualApiKey}
              onChange={(e) => { setManualApiKey(e.target.value); setErrors((prev) => ({ ...prev, apiKey: "" })); }}
              className="font-mono"
              autoComplete="off"
            />
            {effectiveKey ? (
              <p className="text-xs text-muted-foreground break-all">Key yang dikirim: <span className="font-mono">{effectiveKey}</span></p>
            ) : null}
          </div>

          {selectedKeyId && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  {keyRequiresClientAuth
                    ? "Client auth (wajib untuk key ini)"
                    : "Client auth (opsional — isi jika key ini pakai username/password)"}
                </Label>
                {(keyRequiresClientAuth || (clientUsername.trim() && clientPassword)) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCekAuth}
                    disabled={cekAuthLoading || !effectiveKey.trim() || !clientUsername.trim() || !clientPassword}
                  >
                    {cekAuthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    <span className="ml-1.5">Cek Auth</span>
                  </Button>
                )}
              </div>
              {authVerifiedAt != null && (
                <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Auth pernah valid
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Input
                    type="text"
                    placeholder="Client username"
                    value={clientUsername}
                    onChange={(e) => { setClientUsername(e.target.value); setErrors((prev) => ({ ...prev, clientUsername: "" })); }}
                    autoComplete="off"
                  />
                  {errors.clientUsername && <p className="text-xs text-destructive">{errors.clientUsername}</p>}
                </div>
                <div className="space-y-1">
                  <Input
                    type="password"
                    placeholder="Client password"
                    value={clientPassword}
                    onChange={(e) => { setClientPassword(e.target.value); setErrors((prev) => ({ ...prev, clientPassword: "" })); }}
                    autoComplete="off"
                  />
                  {errors.clientPassword && <p className="text-xs text-destructive">{errors.clientPassword}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipe tes</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={testType === "ai" ? "default" : "outline"}
                size="sm"
                onClick={() => setTestType("ai")}
              >
                API AI
              </Button>
              <Button
                type="button"
                variant={testType === "cloud" ? "default" : "outline"}
                size="sm"
                onClick={() => setTestType("cloud")}
              >
                API Cloud
              </Button>
            </div>
          </div>

          {testType === "ai" && (
            <>
              <div className="space-y-2">
                <Label>Provider (AI)</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.filter((p) => allowedProviders.length === 0 || allowedProviders.includes(p.id)).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Model: otomatis pakai default (pertama) untuk provider ini.</p>
              </div>
              <div className="space-y-2">
                <Label>Pertanyaan</Label>
                <Textarea
                  placeholder="Ketik pertanyaan untuk AI..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">POST {base ? `${base}/gateway/${provider}/chat` : `/gateway/${provider}/chat`}</p>
            </>
          )}

          {testType === "cloud" && (
            <>
              <div className="space-y-2">
                <Label>Provider (Cloud)</Label>
                <Select value={provider} onValueChange={(v) => { setProvider(v); setCloudFile(null); }}>
                  <SelectTrigger className="border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLOUD_PROVIDERS.filter((p) => allowedProviders.length === 0 || allowedProviders.includes(p.id)).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>File (gambar atau video)</Label>
                <Input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    setCloudFile(e.target.files?.[0] ?? null);
                    setErrors((prev) => ({ ...prev, cloudFile: "" }));
                  }}
                />
                {errors.cloudFile && <p className="text-xs text-destructive">{errors.cloudFile}</p>}
                {cloudFile && <p className="text-xs text-muted-foreground">{cloudFile.name} ({(cloudFile.size / 1024).toFixed(1)} KB)</p>}
              </div>
              <p className="text-xs text-muted-foreground">POST {base ? `${base}/gateway/${provider}/upload` : `/gateway/${provider}/upload`}</p>
            </>
          )}

          <div className="space-y-2">
            <Label>Base URL Gateway (kosongkan = pakai origin saat ini)</Label>
            <Input
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setErrors((prev) => ({ ...prev, baseUrl: "" })); }}
              placeholder="Kosongkan atau http://192.168.56.1:8787"
              className="font-mono text-sm"
            />
            {errors.baseUrl && <p className="text-xs text-destructive">{errors.baseUrl}</p>}
            <p className="text-xs text-muted-foreground">
              Kosongkan agar request ke /gateway/... (proxy ke backend). Jika 401: pastikan backend jalan di port 8787; atau isi Base URL = http://IP-anda:8787.
            </p>
          </div>
          {!keyRequiresClientAuth && (
            <div className="space-y-2">
              <Label>Header API key</Label>
              <Select value={authHeader} onValueChange={(v) => setAuthHeader(v as "x-api-key" | "bearer")}>
                <SelectTrigger className="w-[180px] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="x-api-key">X-API-Key</SelectItem>
                  <SelectItem value="bearer">Authorization: Bearer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {effectiveKey ? (
            <p className="text-xs text-muted-foreground">API key siap dikirim (lihat di atas).</p>
          ) : selectedKeyId ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">Key ini tidak punya API key di server. Paste key manual di kolom di atas (dari saat Anda buat key di Clients).</p>
          ) : null}
          <Button
            onClick={testType === "ai" ? handleSendAi : handleSendCloud}
            disabled={loading || keys.length === 0 || Object.keys(currentValidationErrors).length > 0}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : testType === "cloud" ? <CloudUpload className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
            {loading ? "Mengirim..." : testType === "cloud" ? "Upload" : "Tanya AI"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Response
              {result.status != null && (
                <span className={result.ok ? "text-green-600 dark:text-green-500" : "text-destructive"}>
                  {result.status} — {result.latencyMs ?? "—"} ms
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!result.ok && result.status === 401 && (() => {
              try {
                const parsed = JSON.parse(result.body);
                const err = parsed?.error;
                if (err) {
                  return (
                    <div className="rounded border border-destructive/50 bg-destructive/10 p-3">
                      <p className="text-sm font-medium text-destructive">401 Unauthorized</p>
                      <p className="text-sm text-foreground mt-1">{err}</p>
                      <p className="text-xs text-muted-foreground mt-2">Perbaiki sesuai pesan di atas lalu coba lagi.</p>
                    </div>
                  );
                }
              } catch { /* ignore */ }
              return null;
            })()}
            {result.answer != null && result.answer !== "" && (
              <div className="rounded border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground mb-2">Jawaban</p>
                <p className="text-sm whitespace-pre-wrap">{result.answer}</p>
              </div>
            )}
            {result.cdnUrl && (
              <div className="rounded border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground mb-1">URL CDN</p>
                <p className="font-mono text-xs break-all text-primary">{result.cdnUrl}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    navigator.clipboard.writeText(result.cdnUrl!);
                    toast.success("URL disalin");
                  }}
                >
                  Salin URL
                </Button>
              </div>
            )}
            <pre className="max-h-[320px] overflow-auto rounded border border-border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap break-words">
              {result.body}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TestApiKeyPage;
