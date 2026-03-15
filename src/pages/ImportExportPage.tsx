import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

const ImportExportPage = () => {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_credentials")
      .select("provider_name, provider_type, label, credentials, status")
      .eq("user_id", user.id);

    if (!data || data.length === 0) {
      toast.error("Tidak ada credential untuk diekspor");
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Credential berhasil diekspor!");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) throw new Error("Format tidak valid");

      const rows = data.map((item: any) => ({
        user_id: user.id,
        provider_name: item.provider_name,
        provider_type: item.provider_type,
        label: item.label || null,
        credentials: item.credentials || {},
        status: "active" as const,
      }));

      const { error } = await supabase.from("provider_credentials").insert(rows);
      if (error) throw error;

      toast.success(`${rows.length} credential berhasil diimpor!`);
    } catch (err: any) {
      toast.error("Gagal mengimpor: " + err.message);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">Import / Export</h1>
        <p className="text-sm text-muted-foreground">Kelola credential secara massal dengan format JSON</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-2 font-heading text-lg font-semibold text-foreground">Export Credentials</h2>
          <p className="mb-4 text-sm text-muted-foreground">Download semua credential dalam format JSON</p>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </div>

        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-2 font-heading text-lg font-semibold text-foreground">Import Credentials</h2>
          <p className="mb-4 text-sm text-muted-foreground">Upload file JSON berisi credential baru</p>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} disabled={importing} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> {importing ? "Mengimpor..." : "Import JSON"}
          </Button>
        </div>
      </div>

      <div className="mt-8 card-elevated rounded-xl border border-border p-6">
        <h3 className="mb-2 font-heading text-sm font-semibold text-foreground">Format JSON</h3>
        <pre className="rounded-lg bg-secondary p-4 font-mono text-xs text-muted-foreground overflow-x-auto">
{`[
  {
    "provider_name": "gemini",
    "provider_type": "ai",
    "label": "Key 1",
    "credentials": { "api_key": "AIza..." }
  },
  {
    "provider_name": "cloudinary",
    "provider_type": "media",
    "label": "Prod Account",
    "credentials": {
      "cloud_name": "mycloud",
      "api_key": "123456",
      "api_secret": "abc..."
    }
  }
]`}
        </pre>
      </div>
    </div>
  );
};

export default ImportExportPage;
