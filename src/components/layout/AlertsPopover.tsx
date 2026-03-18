import { Bell, CheckCheck, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayAlerts } from "@/hooks/useGatewayAlerts"

const severityVariant = (severity: string) => {
  if (severity === "critical") return "destructive"
  if (severity === "warning") return "secondary"
  return "outline"
}

export const AlertsPopover = () => {
  const { alerts, unreadCount, loading, acknowledgeAlert } = useGatewayAlerts()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Pusat Alert</p>
              <p className="text-xs text-muted-foreground">Ringkasan alert aktif untuk operasional gateway</p>
            </div>
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          <div className="space-y-2 p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Memuat alert...</p>
            ) : alerts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Tidak ada alert aktif.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{alert.title}</p>
                        <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(alert.created_at).toLocaleString("id-ID")}
                        {alert.provider ? ` · ${alert.provider}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => acknowledgeAlert(alert.id)}
                      title="Tandai ditinjau"
                    >
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default AlertsPopover
