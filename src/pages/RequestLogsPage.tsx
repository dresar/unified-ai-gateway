import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface LogEntry {
  id: string;
  provider_name: string;
  provider_type: string;
  endpoint: string | null;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

const RequestLogsPage = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("request_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setLogs(data || []);
        setLoading(false);
      });
  }, [user]);

  const statusColor = (code: number | null) => {
    if (!code) return "text-muted-foreground";
    if (code < 300) return "text-success";
    if (code < 500) return "text-warning";
    return "text-destructive";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">Request Logs</h1>
        <p className="text-sm text-muted-foreground">Monitor semua request yang diproses oleh gateway</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : logs.length === 0 ? (
        <div className="card-elevated rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Belum ada request log.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="text-sm">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 font-heading text-foreground">{log.provider_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{log.method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">{log.endpoint || "-"}</td>
                  <td className={`px-4 py-3 font-mono text-xs font-bold ${statusColor(log.status_code)}`}>
                    {log.status_code || "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {log.response_time_ms ? `${log.response_time_ms}ms` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RequestLogsPage;
