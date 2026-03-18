import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, RefreshCw, Pencil, Key, Download, Upload, Eye, EyeOff, FileJson, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

type ProviderType = "ai" | "media" | "automation";
type CredentialStatus = "active" | "cooldown" | "disabled";

const providers = [
  { name: "gemini", type: "ai" as const, fields: ["api_key"], label: "Gemini" },
  { name: "groq", type: "ai" as const, fields: ["api_key"], label: "Groq" },
  { name: "apify", type: "automation" as const, fields: ["api_token"], label: "Apify" },
  { name: "cloudinary", type: "media" as const, fields: ["cloud_name", "api_key", "api_secret"], label: "Cloudinary" },
  { name: "imagekit", type: "media" as const, fields: ["public_key", "private_key", "url_endpoint"], label: "ImageKit" },
];

const AI_PROVIDERS = ["gemini", "groq", "apify"];
const CLOUD_PROVIDERS = ["cloudinary", "imagekit"];

/** Template JSON untuk import: API Key (Gemini, Groq, Apify). */
const TEMPLATE_API_KEY_JSON = [
  { provider_name: "gemini", provider_type: "ai", label: "Contoh Gemini", credentials: { api_key: "ISI_API_KEY_ANDA" } },
  { provider_name: "groq", provider_type: "ai", label: "Contoh Groq", credentials: { api_key: "ISI_API_KEY_ANDA" } },
  { provider_name: "apify", provider_type: "automation", label: "Contoh Apify", credentials: { api_token: "ISI_APIFY_TOKEN" } },
];

/** Template JSON untuk import: Cloud (Cloudinary, ImageKit). */
const TEMPLATE_CLOUD_JSON = [
  { provider_name: "cloudinary", provider_type: "media", label: "Contoh Cloudinary", credentials: { cloud_name: "nama_cloud", api_key: "API_KEY", api_secret: "API_SECRET" } },
  { provider_name: "imagekit", provider_type: "media", label: "Contoh ImageKit", credentials: { public_key: "PUBLIC_KEY", private_key: "PRIVATE_KEY", url_endpoint: "https://ik.imagekit.io/your_id" } },
];

type ImportItem = { provider_name: string; provider_type: ProviderType; label: string | null; credentials: Record<string, string> };

function downloadTemplateJson(kind: "api_key" | "cloud") {
  const arr = kind === "api_key" ? TEMPLATE_API_KEY_JSON : TEMPLATE_CLOUD_JSON;
  const blob = new Blob([JSON.stringify(arr, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template-credentials-${kind}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplateCsv(kind: "api_key" | "cloud") {
  const headers = "provider_name,provider_type,label,api_key,api_token,cloud_name,api_secret,public_key,private_key,url_endpoint";
  const rows = kind === "api_key"
    ? [
        "gemini,ai,Contoh Gemini,ISI_API_KEY_ANDA,,,,",
        "groq,ai,Contoh Groq,ISI_API_KEY_ANDA,,,,",
        "apify,automation,Contoh Apify,,ISI_APIFY_TOKEN,,,,",
      ]
    : [
        "cloudinary,media,Contoh Cloudinary,API_KEY,,nama_cloud,API_SECRET,,",
        "imagekit,media,Contoh ImageKit,,,,,,,PUBLIC_KEY,PRIVATE_KEY,https://ik.imagekit.io/your_id",
      ];
  const csv = [headers, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template-credentials-${kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvToItems(text: string): ImportItem[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV minimal 2 baris (header + data)");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^\s+|\s+$/g, ""));
  const col = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  const credKeys = ["api_key", "api_token", "cloud_name", "api_secret", "public_key", "private_key", "url_endpoint"];
  const items: ImportItem[] = [];
  const validTypes = ["ai", "media", "automation"];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const provider_name = col(row, "provider_name");
    const pt = col(row, "provider_type");
    const provider_type = validTypes.includes(pt) ? pt : "ai";
    if (!provider_name) continue;
    const label = col(row, "label") || null;
    const credentials: Record<string, string> = {};
    for (const k of credKeys) {
      const v = col(row, k);
      if (v) credentials[k] = v;
    }
    items.push({ provider_name, provider_type: provider_type as ProviderType, label, credentials });
  }
  if (items.length === 0) throw new Error("Tidak ada baris data valid di CSV");
  return items;
}

interface Credential {
  id: string;
  provider_name: string;
  provider_type: ProviderType;
  label: string | null;
  status: CredentialStatus;
  total_requests: number;
  failed_requests: number;
  cooldown_until: string | null;
  created_at: string;
  credentials?: Record<string, string>;
}

const CredentialsPage = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [label, setLabel] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [filterLeft, setFilterLeft] = useState<string>("gemini");
  const [filterRight, setFilterRight] = useState<string>("cloudinary");
  const [credDetails, setCredDetails] = useState<Record<string, Credential & { credentials?: Record<string, string> }>>({});
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const fetchCredentials = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<Credential[]>("/api/credentials");
      setCredentials(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memuat credential");
    }
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchCredentials().finally(() => setLoading(false));
  }, [user]);

  const leftCredentials = useMemo(() => {
    if (filterLeft === "all") return credentials.filter((c) => AI_PROVIDERS.includes(c.provider_name));
    return credentials.filter((c) => c.provider_name === filterLeft);
  }, [credentials, filterLeft]);

  const rightCredentials = useMemo(() => {
    if (filterRight === "all") return credentials.filter((c) => CLOUD_PROVIDERS.includes(c.provider_name));
    return credentials.filter((c) => c.provider_name === filterRight);
  }, [credentials, filterRight]);

  const providerConfig = providers.find((p) => p.name === selectedProvider);

  const handleAdd = async () => {
    if (!user || !providerConfig) return;
    setSaving(true);
    try {
      await apiFetch("/api/credentials", {
        method: "POST",
        body: JSON.stringify({
          provider_name: providerConfig.name,
          provider_type: providerConfig.type,
          label: label || null,
          credentials: fieldValues,
        }),
      });
      toast.success("Credential berhasil ditambahkan!");
      setOpenAdd(false);
      setSelectedProvider("");
      setLabel("");
      setFieldValues({});
      fetchCredentials();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menambahkan credential");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const cred = await apiFetch<Credential & { credentials?: Record<string, string> }>(`/api/credentials/${id}`);
      setEditingId(id);
      setSelectedProvider(cred.provider_name);
      setLabel(cred.label ?? "");
      setFieldValues((cred.credentials as Record<string, string>) ?? {});
      setOpenEdit(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memuat data");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/credentials/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ label, credentials: fieldValues }),
      });
      toast.success("Credential diperbarui");
      setOpenEdit(false);
      setEditingId(null);
      fetchCredentials();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/credentials/${id}`, { method: "DELETE" });
      toast.success("Credential dihapus");
      fetchCredentials();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await apiFetch(`/api/credentials/${id}/reactivate`, { method: "POST" });
      toast.success("Credential diaktifkan kembali");
      fetchCredentials();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal mengaktifkan");
    }
  };

  const handleExportCredentials = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const items = await apiFetch<Array<{ provider_name: string; provider_type: string; label: string | null; credentials: Record<string, string>; status: string }>>("/api/credentials/export");
      if (items.length === 0) {
        toast.error("Tidak ada credential untuk diekspor");
        return;
      }
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `credentials-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Credential berhasil diekspor");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal export");
    } finally {
      setExporting(false);
    }
  };

  const handleImportCredentials = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);
    try {
      const text = await file.text();
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let items: ImportItem[];
      if (isCsv) {
        items = parseCsvToItems(text);
      } else {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed)) throw new Error("Format JSON harus array");
        items = parsed.map((item: unknown) => {
          if (typeof item !== "object" || item === null) throw new Error("Item tidak valid");
          const o = item as Record<string, unknown>;
          return {
            provider_name: String(o.provider_name ?? ""),
            provider_type: (["ai", "media", "automation"].includes(String(o.provider_type)) ? o.provider_type : "ai") as ProviderType,
            label: typeof o.label === "string" ? o.label : null,
            credentials: (typeof o.credentials === "object" && o.credentials !== null ? o.credentials : {}) as Record<string, string>,
          };
        });
      }
      await apiFetch("/api/credentials/import", { method: "POST", body: JSON.stringify({ items }) });
      toast.success(`${items.length} credential diimpor`);
      fetchCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal import");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const toggleShowKey = async (cred: Credential) => {
    const id = cred.id;
    if (!credDetails[id]) {
      try {
        const detail = await apiFetch<Credential & { credentials?: Record<string, string> }>(`/api/credentials/${id}`);
        setCredDetails((prev) => ({ ...prev, [id]: detail }));
      } catch {
        toast.error("Gagal memuat detail");
        return;
      }
    }
    setVisibleKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusColor = (status: string) =>
    status === "active" ? "text-emerald-600" : status === "cooldown" ? "text-amber-600" : "text-red-600";

  const renderCredentialCard = (cred: Credential) => {
    const prov = providers.find((p) => p.name === cred.provider_name);
    return (
      <div
        key={cred.id}
        className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-background/50 p-3 text-sm transition-colors hover:bg-background/70"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {prov?.label ?? cred.provider_name}
            {cred.label && <span className="ml-1 text-muted-foreground">· {cred.label}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className={statusColor(cred.status)}>● {cred.status}</span>
            <span>{cred.total_requests} req</span>
            <span>{cred.failed_requests} err</span>
          </div>
          {prov && credDetails[cred.id] && (
            <div className="mt-2 flex items-center gap-1 font-mono text-xs">
              <span className="text-muted-foreground">{prov.fields[0]}:</span>
              <span className="max-w-[160px] truncate text-foreground sm:max-w-[200px]">
                {visibleKeyIds.has(cred.id)
                  ? ((credDetails[cred.id].credentials as Record<string, string>)?.[prov.fields[0]] ?? "—")
                  : "••••••••••••"}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => toggleShowKey(cred)} title={visibleKeyIds.has(cred.id) ? "Sembunyikan" : "Tampilkan"}>
                {visibleKeyIds.has(cred.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
          {prov && !credDetails[cred.id] && (
            <div className="mt-1">
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => toggleShowKey(cred)} title="Tampilkan API key">
                <Eye className="h-3.5 w-3.5" /> Lihat key
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(cred.id)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          {cred.status !== "active" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleReactivate(cred.id)} title="Aktifkan">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(cred.id)} title="Hapus">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const addForm = (
    <div className="space-y-4">
      <div>
        <Label>Provider</Label>
        <Select value={selectedProvider} onValueChange={(v) => { setSelectedProvider(v); setFieldValues({}); }}>
          <SelectTrigger className="border-border bg-background">
            <SelectValue placeholder="Pilih provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Gemini (AI)</SelectItem>
            <SelectItem value="groq">Groq (AI)</SelectItem>
            <SelectItem value="apify">Apify (AI)</SelectItem>
            <SelectItem value="cloudinary">Cloudinary (Cloud)</SelectItem>
            <SelectItem value="imagekit">ImageKit (Cloud)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Label (opsional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mis: Key Utama" className="bg-background" />
      </div>
      {providerConfig?.fields.map((field) => (
        <div key={field}>
          <Label>{field.replace(/_/g, " ")}</Label>
          <Input
            type="password"
            value={fieldValues[field] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
            placeholder={`Masukkan ${field}`}
            className="font-mono text-sm bg-background"
          />
          {selectedProvider === "cloudinary" && field === "api_secret" && (
            <p className="mt-1 text-xs text-muted-foreground">Harus persis sama dengan API Secret di Dashboard Cloudinary (Settings → API Keys). Jangan ada spasi di awal/akhir.</p>
          )}
        </div>
      ))}
      <Button onClick={handleAdd} disabled={saving || !selectedProvider} className="w-full">
        {saving ? "Menyimpan..." : "Simpan Credential"}
      </Button>
    </div>
  );

  const editFormProvider = providers.find((p) => p.name === selectedProvider);
  const editForm = (
    <div className="space-y-4">
      <div>
        <Label>Provider</Label>
        <Input value={editFormProvider?.label ?? selectedProvider} disabled className="bg-muted" />
      </div>
      <div>
        <Label>Label (opsional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mis: Key Utama" className="bg-background" />
      </div>
      {editFormProvider?.fields.map((field) => (
        <div key={field}>
          <Label>{field.replace(/_/g, " ")}</Label>
          <Input
            type="password"
            value={fieldValues[field] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
            placeholder={`Masukkan ${field}`}
            className="font-mono text-sm bg-background"
          />
          {editFormProvider?.name === "cloudinary" && field === "api_secret" && (
            <p className="mt-1 text-xs text-muted-foreground">Harus persis sama dengan API Secret di Dashboard Cloudinary (Settings → API Keys). Jangan ada spasi di awal/akhir.</p>
          )}
        </div>
      ))}
      <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
        {saving ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Provider Credentials" description="Semua API key provider (Gemini, Groq, Cloudinary, dll)" />
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center py-12">
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      ) : (
        <>
          <Card className="border-border bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Templates Import / Export</CardTitle>
              <p className="text-xs text-muted-foreground">
                Unduh template JSON atau CSV untuk tahu format isi. API Key: Gemini, Groq, Apify. Cloud: Cloudinary, ImageKit.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground self-center mr-1">API Key (AI):</span>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => downloadTemplateJson("api_key")}>
                  <FileJson className="h-3.5 w-3.5" /> JSON
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => downloadTemplateCsv("api_key")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground self-center mr-1">Cloud (Media):</span>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => downloadTemplateJson("cloud")}>
                  <FileJson className="h-3.5 w-3.5" /> JSON
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => downloadTemplateCsv("cloud")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCredentials} disabled={exporting || credentials.length === 0}>
              <Download className="mr-2 h-4 w-4" /> {exporting ? "..." : "Export"}
            </Button>
            <input ref={importFileRef} type="file" accept=".json,.csv" className="hidden" onChange={handleImportCredentials} />
            <Button size="sm" variant="outline" onClick={() => importFileRef.current?.click()} disabled={importing}>
              <Upload className="mr-2 h-4 w-4" /> {importing ? "..." : "Import JSON/CSV"}
            </Button>
            <Dialog open={openAdd} onOpenChange={(o) => { setOpenAdd(o); if (!o) setSelectedProvider(""); setLabel(""); setFieldValues({}); }}>
              <Button size="sm" onClick={() => setOpenAdd(true)}>
                <Plus className="mr-2 h-4 w-4" /> Tambah
              </Button>
              <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah API Key Provider</DialogTitle>
                </DialogHeader>
                {addForm}
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Kiri: AI (Gemini, Groq, Apify) */}
        <Card className="flex flex-col border-border bg-card">
          <CardHeader className="space-y-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Key className="h-4 w-4" />
              AI (Gemini, Groq, Apify)
            </CardTitle>
            <Select value={filterLeft} onValueChange={setFilterLeft}>
              <SelectTrigger className="w-full border-border bg-background text-sm sm:w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="apify">Apify</SelectItem>
                <SelectItem value="all">Semua AI</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <div className="h-[320px] space-y-2 overflow-y-auto pr-1 sm:h-[380px]">
              {leftCredentials.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {credentials.length === 0 ? "Belum ada credential. Klik Tambah untuk menambah (unlimited)." : "Tidak ada credential untuk filter ini."}
                </p>
              ) : (
                leftCredentials.map(renderCredentialCard)
              )}
            </div>
          </CardContent>
        </Card>

        {/* Kanan: Cloud (Cloudinary, ImageKit) */}
        <Card className="flex flex-col border-border bg-card">
          <CardHeader className="space-y-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Key className="h-4 w-4" />
              Cloud (Cloudinary, ImageKit)
            </CardTitle>
            <Select value={filterRight} onValueChange={setFilterRight}>
              <SelectTrigger className="w-full border-border bg-background text-sm sm:w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudinary">Cloudinary</SelectItem>
                <SelectItem value="imagekit">ImageKit</SelectItem>
                <SelectItem value="all">Semua Cloud</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <div className="h-[320px] space-y-2 overflow-y-auto pr-1 sm:h-[380px]">
              {rightCredentials.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {credentials.length === 0 ? "Belum ada credential." : "Tidak ada credential untuk filter ini."}
                </p>
              ) : (
                rightCredentials.map(renderCredentialCard)
              )}
            </div>
          </CardContent>
        </Card>
          </div>

          <Dialog open={openEdit} onOpenChange={(o) => { setOpenEdit(o); if (!o) setEditingId(null); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Credential</DialogTitle>
              </DialogHeader>
              {openEdit && editForm}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default CredentialsPage;
