import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
}

const StatCard = ({ title, value, icon, trend, trendUp }: StatCardProps) => (
  <div className="card-elevated rounded-xl border border-border p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 font-heading text-2xl font-bold text-foreground">{value}</p>
        {trend && (
          <p className={`mt-1 text-xs ${trendUp ? "text-success" : "text-destructive"}`}>
            {trend}
          </p>
        )}
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
    </div>
  </div>
);

export default StatCard;
