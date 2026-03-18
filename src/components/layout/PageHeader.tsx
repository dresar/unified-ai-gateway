import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import AlertsPopover from "@/components/layout/AlertsPopover";

type PageHeaderProps = {
  title: string;
  description?: string;
};

export const PageHeader = ({ title, description }: PageHeaderProps) => {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const displayName = user?.displayName || user?.email || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-xl font-bold text-foreground sm:text-2xl md:text-3xl truncate">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2 sm:line-clamp-none">{description ?? title}</p>
      </div>
      <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex shrink-0">
        <AlertsPopover />
        <div className="text-right">
          <p className="font-medium text-foreground">
            {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {now.toLocaleDateString("id-ID", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
            {initial}
          </div>
          <div className="max-w-[160px] flex-col hidden md:flex">
            <span className="truncate text-xs font-medium text-foreground">{displayName}</span>
            {user?.email && user.displayName && (
              <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

