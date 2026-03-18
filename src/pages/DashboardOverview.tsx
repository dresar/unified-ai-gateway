import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import StatCard from "@/components/StatCard";
import { Key, Users, ScrollText, AlertTriangle, Zap, Shield, BarChart3, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type UsageDay = { date: string; requests: number; errors: number };
type MonitoringOverview = {
  totals: {
    totalRequests24h: number;
    totalErrors24h: number;
    avgLatencyMs24h: number;
    activeAlerts: number;
    criticalAlerts: number;
  };
  providerHealth: Array<{ provider: string; total_credentials: number; active_credentials: number; cooldown_credentials: number }>;
  noisyKeys: Array<{ api_key_id: string; api_key_name: string; requests: number; errors: number; domains: number }>;
};

const DashboardOverview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalCredentials: 0,
    activeCredentials: 0,
    cooldownCredentials: 0,
    totalClients: 0,
    totalRequests: 0,
    recentErrors: 0,
    activeAlerts: 0,
  });
  const [usageDaily, setUsageDaily] = useState<UsageDay[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringOverview>({
    totals: { totalRequests24h: 0, totalErrors24h: 0, avgLatencyMs24h: 0, activeAlerts: 0, criticalAlerts: 0 },
    providerHealth: [],
    noisyKeys: [],
  });

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<typeof stats>("/api/stats");
      setStats(data);
    } catch (err) {
      setStats({
        totalCredentials: 0,
        activeCredentials: 0,
        cooldownCredentials: 0,
        totalClients: 0,
        totalRequests: 0,
        recentErrors: 0,
        activeAlerts: 0,
      });
    }
  }, [user]);

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ daily: UsageDay[] }>("/api/stats/usage");
      setUsageDaily(res.daily ?? []);
    } catch {
      setUsageDaily([]);
    }
  }, [user]);

  const fetchMonitoring = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<MonitoringOverview>("/api/monitoring/overview");
      setMonitoring(res);
    } catch {
      setMonitoring({
        totals: { totalRequests24h: 0, totalErrors24h: 0, avgLatencyMs24h: 0, activeAlerts: 0, criticalAlerts: 0 },
        providerHealth: [],
        noisyKeys: [],
      });
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
    fetchMonitoring();
  }, [fetchMonitoring, fetchStats]);

  useEffect(() => {
    if (!user) return;
    fetchUsage();
    fetchMonitoring();
    const t = setInterval(() => {
      fetchUsage();
      fetchMonitoring();
    }, 30000);
    return () => clearInterval(t);
  }, [user, fetchMonitoring, fetchUsage]);

  const chartData = useMemo(() => {
    return usageDaily.map((d) => ({
      date: new Date(d.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      dateFull: new Date(d.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      requests: d.requests,
      errors: d.errors,
      errorRate: d.requests > 0 ? Math.round((d.errors / d.requests) * 100) : 0,
    }));
  }, [usageDaily]);

  const usageSummary = useMemo(() => {
    const totalRequests = chartData.reduce((s, d) => s + d.requests, 0);
    const totalErrors = chartData.reduce((s, d) => s + d.errors, 0);
    return {
      totalRequests,
      totalErrors,
      errorRatePct: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : "0",
    };
  }, [chartData]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Ringkasan operasional gateway API Anda." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Credentials" value={stats.totalCredentials} icon={<Key className="h-5 w-5" />} />
        <StatCard title="Credentials Aktif" value={stats.activeCredentials} icon={<Shield className="h-5 w-5" />} trend="Online" trendUp />
        <StatCard title="Cooldown" value={stats.cooldownCredentials} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard title="API Clients" value={stats.totalClients} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Total Permintaan" value={stats.totalRequests} icon={<ScrollText className="h-5 w-5" />} />
        <StatCard title="Total Error" value={stats.recentErrors} icon={<Zap className="h-5 w-5" />} />
        <StatCard title="Alert Aktif" value={monitoring.totals.activeAlerts} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard title="Rata-rata Latensi 24 Jam" value={`${monitoring.totals.avgLatencyMs24h} ms`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard title="Alert Kritis" value={monitoring.totals.criticalAlerts} icon={<Shield className="h-5 w-5" />} />
      </div>

      {/* Analitik & Pemakaian */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <BarChart3 className="h-4 w-4" />
              Analitik Pemakaian
            </CardTitle>
            <CardDescription>Request & error gateway 7 hari terakhir — diperbarui otomatis</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Realtime
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {chartData.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{usageSummary.totalRequests}</p>
                  <p className="text-xs text-muted-foreground">Total Request (7 hari)</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{usageSummary.totalErrors}</p>
                  <p className="text-xs text-muted-foreground">Total Error (7 hari)</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{usageSummary.errorRatePct}%</p>
                  <p className="text-xs text-muted-foreground">Error Rate</p>
                </div>
              </div>
              <div className="h-[240px] w-full sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashboardFillRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      content={({ active, payload }) =>
                        active && payload?.[0]?.payload ? (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md min-w-[180px]">
                            <p className="font-medium text-foreground border-b border-border pb-1 mb-2">
                              {payload[0].payload.dateFull}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                              <span>Request:</span>
                              <span className="font-semibold text-foreground text-right">{payload[0].payload.requests}</span>
                              <span>Error:</span>
                              <span className="font-semibold text-destructive text-right">{payload[0].payload.errors}</span>
                              <span>Error rate:</span>
                              <span className="font-semibold text-foreground text-right">{payload[0].payload.errorRate}%</span>
                            </div>
                          </div>
                        ) : null
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="hsl(var(--primary))"
                      fill="url(#dashboardFillRequests)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <div className="min-w-[280px] bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground grid grid-cols-4 gap-2">
                  <span>Tanggal</span>
                  <span className="text-right">Request</span>
                  <span className="text-right">Error</span>
                  <span className="text-right">Error rate</span>
                </div>
                {chartData.map((row, i) => (
                  <div
                    key={i}
                    className="min-w-[280px] border-t border-border px-3 py-2 text-xs grid grid-cols-4 gap-2 items-center"
                  >
                    <span className="text-muted-foreground">{row.dateFull}</span>
                    <span className="text-right font-medium text-foreground">{row.requests}</span>
                    <span className="text-right font-medium text-destructive">{row.errors}</span>
                    <span className="text-right font-medium text-foreground">{row.errorRate}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 sm:h-[240px]">
              <p className="text-center text-sm text-muted-foreground">
                Belum ada data pemakaian. Request lewat API key akan tampil di sini.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Provider Health</CardTitle>
            <CardDescription>Status credential aktif dan cooldown per provider</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monitoring.providerHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada data provider.</p>
            ) : (
              monitoring.providerHealth.map((row) => (
                <div key={row.provider} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground capitalize">{row.provider}</p>
                      <p className="text-xs text-muted-foreground">Total credential: {row.total_credentials}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">Aktif {row.active_credentials}</Badge>
                      <Badge variant={row.cooldown_credentials > 0 ? "secondary" : "outline"}>Cooldown {row.cooldown_credentials}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Noisy API Keys</CardTitle>
            <CardDescription>Key paling ramai 24 jam terakhir, termasuk spread domain dan error</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monitoring.noisyKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada data pemakaian API key.</p>
            ) : (
              monitoring.noisyKeys.map((row) => (
                <div key={row.api_key_id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{row.api_key_name}</p>
                      <p className="text-xs text-muted-foreground">Errors {row.errors} · Domains {row.domains}</p>
                    </div>
                    <Badge variant={row.errors > 0 ? "secondary" : "outline"}>{row.requests} req</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Provider Summary */}
      <div className="mt-4">
        <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Supported Providers</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { name: "Gemini", type: "AI", color: "text-info" },
            { name: "Groq", type: "AI", color: "text-primary" },
            { name: "ImageKit", type: "Media", color: "text-success" },
            { name: "Cloudinary", type: "Media", color: "text-warning" },
            { name: "Apify", type: "Automation", color: "text-accent" },
          ].map((p) => (
            <div key={p.name} className="card-elevated rounded-lg border border-border p-4 text-center">
              <p className={`font-heading text-sm font-bold ${p.color}`}>{p.name}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{p.type}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
