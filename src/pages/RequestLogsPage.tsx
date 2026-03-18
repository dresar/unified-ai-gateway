import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LogEntry {
  id: string;
  provider_name: string;
  provider_type: string;
  endpoint: string | null;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  error_type?: string | null;
  origin_domain?: string | null;
  request_path?: string | null;
  detected_anomaly_types?: string[];
  api_key_id?: string | null;
  api_key_name?: string | null;
  credential_id?: string | null;
  created_at: string;
}

const RequestLogsPage = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const loadLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (provider !== "all") params.set("provider", provider);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<LogEntry[]>(`/api/logs?${params.toString()}`);
      setLogs(Array.isArray(data) ? data : []);
      setSelectedLog((prev) => (prev ? data.find((log) => log.id === prev.id) ?? prev : data[0] ?? null));
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [provider, search, status, user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      loadLogs().catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [loadLogs, user]);

  useEffect(() => {
    if (!user || !live) return;
    const timer = setInterval(() => {
      loadLogs().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [live, loadLogs, user]);

  const providers = useMemo(() => Array.from(new Set(logs.map((log) => log.provider_name))).sort(), [logs]);

  const statusColor = (code: number | null) => {
    if (!code) return "text-muted-foreground";
    if (code < 300) return "text-emerald-600";
    if (code < 500) return "text-amber-600";
    return "text-destructive";
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Log Permintaan" description="Pantau permintaan gateway, anomali, dan status provider secara terpusat." />

      <Card className="border-border bg-card">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari endpoint, domain, key, error..." />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">Semua provider</option>
            {providers.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Semua status</option>
            <option value="success">Sukses</option>
            <option value="error">Error</option>
          </select>
          <Button variant={live ? "default" : "outline"} onClick={() => setLive((prev) => !prev)}>
            {live ? "Pemantauan Aktif" : "Pemantauan Nonaktif"}
          </Button>
          <Button variant="outline" onClick={() => loadLogs()}>Muat Ulang</Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Memuat log permintaan...</p>
      ) : logs.length === 0 ? (
        <div className="card-elevated rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Belum ada request log.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Permintaan Terbaru</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Anomali</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelectedLog(log)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("id-ID")}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{log.provider_name}</p>
                          <p className="text-[11px] text-muted-foreground">{log.api_key_name || "Unnamed key"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] font-mono text-xs text-muted-foreground">
                        <div className="truncate">{log.endpoint || log.request_path || "-"}</div>
                      </TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${statusColor(log.status_code)}`}>{log.status_code || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{log.response_time_ms != null ? `${log.response_time_ms} ms` : "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(log.detected_anomaly_types ?? []).length === 0 ? (
                            <Badge variant="outline">Normal</Badge>
                          ) : (
                            (log.detected_anomaly_types ?? []).map((item) => (
                              <Badge key={item} variant={item.includes("leak") || item.includes("unavailable") ? "destructive" : "secondary"}>
                                {item}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detail Permintaan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedLog ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Provider</p>
                      <p className="text-sm font-medium text-foreground">{selectedLog.provider_name}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">API Key</p>
                      <p className="text-sm font-medium text-foreground">{selectedLog.api_key_name || "Unnamed key"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className={`text-sm font-semibold ${statusColor(selectedLog.status_code)}`}>{selectedLog.status_code || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Latency</p>
                      <p className="text-sm font-medium text-foreground">{selectedLog.response_time_ms != null ? `${selectedLog.response_time_ms} ms` : "-"}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Path</p>
                    <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedLog.request_path || selectedLog.endpoint || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Origin Domain</p>
                    <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedLog.origin_domain || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Error</p>
                    <p className="mt-1 text-sm text-foreground">{selectedLog.error_message || "-"}</p>
                    {selectedLog.error_type ? <p className="mt-2 font-mono text-xs text-muted-foreground">Type: {selectedLog.error_type}</p> : null}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Anomaly Flags</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedLog.detected_anomaly_types ?? []).length === 0 ? (
                        <Badge variant="outline">Tidak ada</Badge>
                      ) : (
                        (selectedLog.detected_anomaly_types ?? []).map((item) => (
                          <Badge key={item} variant={item.includes("leak") || item.includes("unavailable") ? "destructive" : "secondary"}>
                            {item}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Pilih log untuk melihat detail.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RequestLogsPage;
