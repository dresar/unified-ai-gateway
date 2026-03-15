import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StatCard from "@/components/StatCard";
import { Key, Users, ScrollText, AlertTriangle, Zap, Shield } from "lucide-react";

const DashboardOverview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalCredentials: 0,
    activeCredentials: 0,
    cooldownCredentials: 0,
    totalClients: 0,
    totalRequests: 0,
    recentErrors: 0,
  });

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [credRes, clientRes, logRes, errorRes] = await Promise.all([
        supabase.from("provider_credentials").select("status", { count: "exact" }).eq("user_id", user.id),
        supabase.from("api_clients").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("request_logs").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("request_logs").select("id", { count: "exact" }).eq("user_id", user.id).gte("status_code", 400),
      ]);

      const creds = credRes.data || [];
      setStats({
        totalCredentials: credRes.count || 0,
        activeCredentials: creds.filter((c) => c.status === "active").length,
        cooldownCredentials: creds.filter((c) => c.status === "cooldown").length,
        totalClients: clientRes.count || 0,
        totalRequests: logRes.count || 0,
        recentErrors: errorRes.count || 0,
      });
    };

    fetchStats();
  }, [user]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview platform API Gateway Anda</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Credentials" value={stats.totalCredentials} icon={<Key className="h-5 w-5" />} />
        <StatCard title="Credentials Aktif" value={stats.activeCredentials} icon={<Shield className="h-5 w-5" />} trend="Online" trendUp />
        <StatCard title="Cooldown" value={stats.cooldownCredentials} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard title="API Clients" value={stats.totalClients} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Total Request" value={stats.totalRequests} icon={<ScrollText className="h-5 w-5" />} />
        <StatCard title="Error Count" value={stats.recentErrors} icon={<Zap className="h-5 w-5" />} />
      </div>

      {/* Provider Summary */}
      <div className="mt-8">
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
