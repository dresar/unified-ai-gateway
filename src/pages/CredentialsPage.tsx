import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const providers = [
  { name: "gemini", type: "ai" as const, fields: ["api_key"] },
  { name: "groq", type: "ai" as const, fields: ["api_key"] },
  { name: "imagekit", type: "media" as const, fields: ["public_key", "private_key", "url_endpoint"] },
  { name: "cloudinary", type: "media" as const, fields: ["cloud_name", "api_key", "api_secret"] },
  { name: "apify", type: "automation" as const, fields: ["api_token"] },
];

interface Credential {
  id: string;
  provider_name: string;
  provider_type: string;
  label: string | null;
  status: string;
  total_requests: number;
  failed_requests: number;
  cooldown_until: string | null;
  created_at: string;
}

const CredentialsPage = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [label, setLabel] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchCredentials = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_credentials")
      .select("id, provider_name, provider_type, label, status, total_requests, failed_requests, cooldown_until, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCredentials(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCredentials(); }, [user]);

  const providerConfig = providers.find((p) => p.name === selectedProvider);

  const handleAdd = async () => {
    if (!user || !providerConfig) return;
    setSaving(true);

    const { error } = await supabase.from("provider_credentials").insert({
      user_id: user.id,
      provider_name: providerConfig.name,
      provider_type: providerConfig.type,
      label: label || null,
      credentials: fieldValues,
    });

    if (error) {
      toast.error("Gagal menambahkan credential: " + error.message);
    } else {
      toast.success("Credential berhasil ditambahkan!");
      setOpen(false);
      setSelectedProvider("");
      setLabel("");
      setFieldValues({});
      fetchCredentials();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("provider_credentials").delete().eq("id", id);
    if (error) toast.error("Gagal menghapus");
    else { toast.success("Credential dihapus"); fetchCredentials(); }
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase
      .from("provider_credentials")
      .update({ status: "active" as any, cooldown_until: null })
      .eq("id", id);
    if (error) toast.error("Gagal mengaktifkan");
    else { toast.success("Credential diaktifkan kembali"); fetchCredentials(); }
  };

  const statusColor = (status: string) => {
    if (status === "active") return "text-success";
    if (status === "cooldown") return "text-warning";
    return "text-destructive";
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Provider Credentials</h1>
          <p className="text-sm text-muted-foreground">Kelola credential API provider eksternal</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Tambah Credential</Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">Tambah Credential Baru</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-foreground">Provider</Label>
                <Select value={selectedProvider} onValueChange={(v) => { setSelectedProvider(v); setFieldValues({}); }}>
                  <SelectTrigger className="border-border bg-secondary text-foreground">
                    <SelectValue placeholder="Pilih provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name.charAt(0).toUpperCase() + p.name.slice(1)} ({p.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground">Label (opsional)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mis: Key Utama" className="border-border bg-secondary text-foreground" />
              </div>
              {providerConfig?.fields.map((field) => (
                <div key={field}>
                  <Label className="text-foreground">{field}</Label>
                  <Input
                    type="password"
                    value={fieldValues[field] || ""}
                    onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
                    placeholder={`Masukkan ${field}`}
                    className="border-border bg-secondary text-foreground font-mono text-sm"
                  />
                </div>
              ))}
              <Button onClick={handleAdd} disabled={saving || !selectedProvider} className="w-full">
                {saving ? "Menyimpan..." : "Simpan Credential"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : credentials.length === 0 ? (
        <div className="card-elevated rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Belum ada credential. Tambahkan untuk mulai menggunakan gateway.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div key={cred.id} className="card-elevated flex items-center justify-between rounded-xl border border-border p-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">
                    {cred.provider_name.charAt(0).toUpperCase() + cred.provider_name.slice(1)}
                    {cred.label && <span className="ml-2 text-muted-foreground">· {cred.label}</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-3 font-mono text-xs">
                    <span className={statusColor(cred.status)}>● {cred.status}</span>
                    <span className="text-muted-foreground">{cred.total_requests} req</span>
                    <span className="text-muted-foreground">{cred.failed_requests} err</span>
                    <span className="text-muted-foreground">{cred.provider_type}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cred.status !== "active" && (
                  <Button variant="ghost" size="icon" onClick={() => handleReactivate(cred.id)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => handleDelete(cred.id)} className="hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CredentialsPage;
