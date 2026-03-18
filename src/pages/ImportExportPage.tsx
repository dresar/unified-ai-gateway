import { useState, useRef, type ChangeEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";

type ProviderType = "ai" | "media" | "automation";
type CredentialStatus = "active" | "cooldown" | "disabled";
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isProviderType = (value: unknown): value is ProviderType =>
  value === "ai" || value === "media" || value === "automation";

const isCredentialStatus = (value: unknown): value is CredentialStatus =>
  value === "active" || value === "cooldown" || value === "disabled";

interface ExportRow {
  provider_name: string;
  provider_type: ProviderType;
  label: string | null;
  credentials: Json;
  status: CredentialStatus;
}

const ImportExportPage = () => {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<ExportRow[]>("/api/credentials/export");
      const rows = data.map((r) => ({
        provider_name: r.provider_name,
        provider_type: r.provider_type,
        label: r.label,
        credentials: r.credentials,
        status: r.status,
      }));

      if (rows.length === 0) {
        toast.error("Tidak ada credential untuk diekspor");
        return;
      }

      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `credentials-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Credential berhasil diekspor.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Gagal export";
      toast.error(message);
      return;
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!Array.isArray(parsed)) throw new Error("Format tidak valid");

      const rows: ExportRow[] = parsed.map((item) => {
        if (!isRecord(item)) throw new Error("Format item tidak valid");
        if (typeof item.provider_name !== "string") throw new Error("provider_name wajib string");
        if (!isProviderType(item.provider_type)) throw new Error("provider_type tidak valid");

        const label = typeof item.label === "string" ? item.label : null;
        const credentials = (item.credentials ?? {}) as Json;
        const status = isCredentialStatus(item.status) ? item.status : "active";

        return {
          provider_name: item.provider_name,
          provider_type: item.provider_type,
          label,
          credentials,
          status,
        };
      });

      await apiFetch("/api/credentials/import", { method: "POST", body: JSON.stringify({ items: rows }) });

      toast.success(`${rows.length} credential berhasil diimpor!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Gagal mengimpor: " + message);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Import / Export" description="Kelola credential secara massal dengan format JSON." />
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-2 font-heading text-lg font-semibold text-foreground">Export Credentials</h2>
          <p className="mb-4 text-sm text-muted-foreground">Unduh seluruh credential dalam format JSON saat fitur ekspor diizinkan pada environment ini.</p>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </div>

        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-2 font-heading text-lg font-semibold text-foreground">Import Credentials</h2>
          <p className="mb-4 text-sm text-muted-foreground">Unggah file JSON untuk menambahkan atau memigrasikan credential.</p>
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
