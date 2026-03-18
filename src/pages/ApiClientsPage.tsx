import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Shield, Download, BarChart3, Globe, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini" },
  { id: "groq", label: "Groq" },
  { id: "cloudinary", label: "Cloudinary" },
  { id: "imagekit", label: "ImageKit" },
  { id: "apify", label: "Apify" },
];

interface GatewayKey {
  id: string;
  tenant_id: string;
  status: string;
  quota_per_minute: number;
  allowed_providers?: string[];
  name?: string | null;
  created_at: string;
  remaining?: number | null;
}

interface KeyStats {
  daily: { date: string; requests: number; errors: number }[];
}

interface KeyAnalytics {
  summary: { requests: number; errors: number; avgLatencyMs: number; domains: number };
  series: { bucket: string; requests: number; errors: number; avg_latency_ms: number }[];
  alerts: { id: string; title: string; message: string; severity: string; created_at: string }[];
}

const ApiClientsPage = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState<GatewayKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [newKeyQuota, setNewKeyQuota] = useState("1000");
  const [newKeyProvider, setNewKeyProvider] = useState<string>("gemini");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [detailKeyId, setDetailKeyId] = useState<string | null>(null);
  const [stats, setStats] = useState<KeyStats | null>(null);
  const [analytics, setAnalytics] = useState<KeyAnalytics | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createdKeyRaw, setCreatedKeyRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newKeyClientUsername, setNewKeyClientUsername] = useState("");
  const [newKeyClientPassword, setNewKeyClientPassword] = useState("");

  const fetchKeys = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<GatewayKey[]>("/api/dashboard/keys");
      setKeys(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memuat API keys");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchKeys();
  }, [user, fetchKeys]);

  const filteredKeys = useMemo(() => {
    if (filterProvider === "all") return keys;
    return keys.filter((k) => {
      const name = (k.name || "").toLowerCase().trim();
      const providers = (k.allowed_providers ?? []).map((p) => p.toLowerCase());
      return name === filterProvider || providers.includes(filterProvider);
    });
  }, [keys, filterProvider]);

  const openDetail = async (id: string) => {
    setDetailKeyId(id);
    setStats(null);
    setAnalytics(null);
    setDomains([]);
    setDetailLoading(true);
    try {
      const [s, d, a] = await Promise.all([
        apiFetch<KeyStats>(`/api/keys/${id}/stats`),
        apiFetch<{ domains: string[] }>(`/api/keys/${id}/domains`),
        apiFetch<KeyAnalytics>(`/api/keys/${id}/analytics`),
      ]);
      setStats(s);
      setDomains(d.domains ?? []);
      setAnalytics(a);
    } catch {
      toast.error("Gagal memuat detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setCreatedKeyRaw(null);
    try {
      const body: Record<string, unknown> = {
        quota_per_minute: parseInt(newKeyQuota) || 1000,
        allowed_providers: [newKeyProvider],
      };
      if (newKeyLabel.trim()) body.name = newKeyLabel.trim();
      if (newKeyClientUsername.trim()) body.client_username = newKeyClientUsername.trim();
      if (newKeyClientPassword) body.client_password = newKeyClientPassword;
      const created = await apiFetch<{ api_key: string; id: string }>("/api/keys", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (created.api_key) {
        setCreatedKeyRaw(created.api_key);
        try {
          await navigator.clipboard.writeText(created.api_key);
          setCopied(true);
          toast.success("API Key disalin ke clipboard");
        } catch {
          toast.info("Salin manual dari kotak di bawah");
        }
      } else {
        toast.error("API key tidak dikembalikan dari server");
      }
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal membuat API key");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKeyRaw) return;
    try {
      await navigator.clipboard.writeText(createdKeyRaw);
      setCopied(true);
      toast.success("API Key disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const closeCreateDialog = (open: boolean) => {
    if (!open) {
      setCreatedKeyRaw(null);
      setCopied(false);
      setNewKeyQuota("1000");
      setNewKeyProvider("gemini");
      setNewKeyLabel("");
      setNewKeyClientUsername("");
      setNewKeyClientPassword("");
    }
    setOpenCreate(open);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const meta = keys.map((k) => ({
        id: k.id,
        name: k.name,
        status: k.status,
        quota_per_minute: k.quota_per_minute,
        allowed_providers: k.allowed_providers ?? [],
        created_at: k.created_at,
      }));
      if (meta.length === 0) {
        toast.error("Tidak ada API key untuk diekspor");
        return;
      }
      const blob = new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gateway-keys-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Metadata API key diekspor");
    } catch {
      toast.error("Gagal export");
    } finally {
      setExporting(false);
    }
  };

  const chartData = useMemo(() => {
    if (!stats?.daily?.length) return [];
    return stats.daily.map((d) => ({
      date: new Date(d.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      requests: d.requests,
      errors: d.errors,
    }));
  }, [stats]);

  const analyticsSeries = useMemo(() => {
    if (!analytics?.series?.length) return [];
    return analytics.series.map((row) => ({
      time: new Date(row.bucket).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      requests: row.requests,
      errors: row.errors,
      avgLatencyMs: row.avg_latency_ms,
    }));
  }, [analytics]);

  const detailKey = detailKeyId ? keys.find((k) => k.id === detailKeyId) : null;

  const handleDelete = async (id: string) => {
    const key = keys.find((k) => k.id === id);
    const label = key?.name || "API key";
    if (!window.confirm(`Hapus ${label}? Semua request yang memakai key ini akan berhenti.`)) return;
    try {
      await apiFetch(`/api/keys/${id}`, { method: "DELETE" });
      toast.success("API key dihapus");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus API key");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Gateway API Keys" description="Kelola API key per provider dengan kontrol akses dan kuota yang jelas." />
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center py-12">
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || keys.length === 0}>
            <Download className="mr-2 h-4 w-4" /> {exporting ? "..." : "Export"}
          </Button>
          <Button size="sm" onClick={() => setOpenCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Buat Key
          </Button>
        </div>
      </div>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Shield className="h-4 w-4" />
            Daftar API Key
          </CardTitle>
          <Select value={filterProvider} onValueChange={setFilterProvider}>
            <SelectTrigger className="w-[160px] border-border bg-background text-sm">
              <SelectValue placeholder="Filter provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="groq">Groq</SelectItem>
              <SelectItem value="cloudinary">Cloudinary</SelectItem>
              <SelectItem value="imagekit">ImageKit</SelectItem>
              <SelectItem value="apify">Apify</SelectItem>
              <SelectItem value="all">Semua</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredKeys.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {keys.length === 0 ? "Belum ada API key. Klik Buat Key untuk generate." : "Tidak ada key untuk filter ini."}
              </p>
            ) : (
              filteredKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm transition-colors hover:bg-background/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{k.name || "Unnamed"}</p>
                    <p className="font-mono text-xs text-muted-foreground">ID: {k.id.slice(0, 8)}… · Quota: {k.quota_per_minute}/m · {k.status}</p>
                    {Array.isArray(k.allowed_providers) && k.allowed_providers.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Provider: {k.allowed_providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}</p>
                    )}
                    {k.remaining != null && <p className="text-xs text-muted-foreground">Sisa: {k.remaining}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="outline" size="sm" onClick={() => openDetail(k.id)}>
                      <BarChart3 className="mr-1 h-3.5 w-3.5" /> Detail
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(k.id)}
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={openCreate} onOpenChange={closeCreateDialog}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createdKeyRaw ? "API Key Berhasil Dibuat" : "Buat API Key Baru"}</DialogTitle>
          </DialogHeader>
          {createdKeyRaw ? (
            <div className="space-y-4">
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Simpan API key ini sekarang. Demi keamanan, nilai lengkap hanya ditampilkan satu kali.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdKeyRaw}
                  className="font-mono text-xs bg-muted/50"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopyKey}
                  title="Salin API Key"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => closeCreateDialog(false)} className="w-full">
                  Selesai
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Provider</Label>
                <Select value={newKeyProvider} onValueChange={setNewKeyProvider}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Key ini hanya untuk provider yang dipilih. Rotasi otomatis aktif.</p>
              </div>
              <div>
                <Label>Nama API key (opsional)</Label>
                <Input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Mis: Key production"
                  className="bg-background"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Jika dikosongkan, nama akan otomatis dibuat seperti `Gemini 1`, `Gemini 2`, dan seterusnya.
                </p>
              </div>
              <div>
                <Label>Quota per menit</Label>
                <Input
                  type="number"
                  value={newKeyQuota}
                  onChange={(e) => setNewKeyQuota(e.target.value)}
                  placeholder="1000"
                  className="bg-background"
                />
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">Client auth (opsional)</p>
                <p className="text-xs text-muted-foreground">
                  Jika diisi, pemakai API key harus mengirim Basic Auth (username:password) saat memanggil gateway.
                </p>
                <div>
                  <Label className="text-xs">Client username</Label>
                  <Input
                    type="text"
                    value={newKeyClientUsername}
                    onChange={(e) => setNewKeyClientUsername(e.target.value)}
                    placeholder="username"
                    className="mt-1 bg-background"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label className="text-xs">Client password</Label>
                  <Input
                    type="password"
                    value={newKeyClientPassword}
                    onChange={(e) => setNewKeyClientPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 bg-background"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={saving} className="w-full">
                {saving ? "Membuat..." : "Buat Key"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailKeyId} onOpenChange={(open) => !open && setDetailKeyId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {detailKey?.name || "Detail Key"}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat statistik...</p>
          ) : (
            <div className="space-y-6">
              {analytics && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Requests 7 hari</p>
                    <p className="text-xl font-semibold text-foreground">{analytics.summary.requests}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Errors 7 hari</p>
                    <p className="text-xl font-semibold text-destructive">{analytics.summary.errors}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Avg latency</p>
                    <p className="text-xl font-semibold text-foreground">{analytics.summary.avgLatencyMs} ms</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Domain spread</p>
                    <p className="text-xl font-semibold text-foreground">{analytics.summary.domains}</p>
                  </div>
                </div>
              )}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BarChart3 className="h-4 w-4" /> Statistik pemakaian (7 hari)
                </h4>
                {chartData.length > 0 ? (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          formatter={(value: number) => [value, "Requests"]}
                        />
                        <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="url(#fillRequests)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">Belum ada data pemakaian</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BarChart3 className="h-4 w-4" /> Trend 24 jam (request vs error)
                </h4>
                {analyticsSeries.length > 0 ? (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analyticsSeries} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="fillRequests24h" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="url(#fillRequests24h)" strokeWidth={2} />
                        <Area type="monotone" dataKey="errors" stroke="hsl(var(--destructive))" fillOpacity={0} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">Belum ada trend 24 jam.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe className="h-4 w-4" /> Domain yang mengakses
                </h4>
                {domains.length > 0 ? (
                  <ul className="max-h-[160px] space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs">
                    {domains.map((d) => (
                      <li key={d} className="truncate text-foreground">{d || "(direct)"}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-sm text-muted-foreground">Belum ada domain tercatat</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4" /> Alert timeline
                </h4>
                {analytics?.alerts?.length ? (
                  <div className="space-y-2">
                    {analytics.alerts.map((alert) => (
                      <div key={alert.id} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{alert.title}</p>
                          <Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "secondary" : "outline"}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">{new Date(alert.created_at).toLocaleString("id-ID")}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-sm text-muted-foreground">Belum ada alert untuk API key ini.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
};

export default ApiClientsPage;
