import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface ApiClient {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  rate_limit: number;
  created_at: string;
}

const ApiClientsPage = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rateLimit, setRateLimit] = useState("100");
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("api_clients")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, [user]);

  const handleCreate = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("api_clients").insert({
      user_id: user.id,
      name: name.trim(),
      rate_limit: parseInt(rateLimit) || 100,
    });
    if (error) toast.error("Gagal membuat API client");
    else { toast.success("API Client berhasil dibuat!"); setOpen(false); setName(""); fetchClients(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("api_clients").delete().eq("id", id);
    if (error) toast.error("Gagal menghapus");
    else { toast.success("Client dihapus"); fetchClients(); }
  };

  const handleToggle = async (id: string, current: boolean) => {
    const { error } = await supabase.from("api_clients").update({ is_active: !current }).eq("id", id);
    if (error) toast.error("Gagal mengubah status");
    else { fetchClients(); }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API Key disalin!");
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">API Clients</h1>
          <p className="text-sm text-muted-foreground">Buat API key untuk aplikasi yang mengakses gateway</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Buat Client Baru</Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">Buat API Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-foreground">Nama Client</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis: Website Utama" className="border-border bg-secondary text-foreground" />
              </div>
              <div>
                <Label className="text-foreground">Rate Limit (req/menit)</Label>
                <Input type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} className="border-border bg-secondary text-foreground" />
              </div>
              <Button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full">
                {saving ? "Membuat..." : "Buat Client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="card-elevated rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Belum ada API client. Buat untuk mulai menggunakan gateway.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="card-elevated rounded-xl border border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-heading text-sm font-semibold text-foreground">{client.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${client.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {client.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded border border-border bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground">
                      {visibleKeys.has(client.id) ? client.api_key : client.api_key.substring(0, 10) + "•".repeat(20)}
                    </code>
                    <button onClick={() => toggleKeyVisibility(client.id)} className="text-muted-foreground hover:text-foreground">
                      {visibleKeys.has(client.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => copyKey(client.api_key)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">Rate limit: {client.rate_limit} req/min</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(client.id, client.is_active)}>
                    {client.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)} className="hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApiClientsPage;
