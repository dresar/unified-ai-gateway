import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode, useCallback } from "react"
import { toast } from "sonner"
import { apiFetch, getAuthToken } from "@/lib/api"
import { useAuth } from "@/hooks/useAuth"

export interface GatewayAlert {
  id: string
  severity: "info" | "warning" | "critical"
  category: string
  title: string
  message: string
  provider?: string | null
  api_key_id?: string | null
  status: string
  created_at: string
  acknowledged_at?: string | null
  metadata?: Record<string, unknown>
}

interface GatewayAlertsContextValue {
  alerts: GatewayAlert[]
  unreadCount: number
  loading: boolean
  acknowledgeAlert: (id: string) => Promise<void>
  refreshAlerts: () => Promise<void>
}

const GatewayAlertsContext = createContext<GatewayAlertsContextValue | undefined>(undefined)
const enableRealtimeAlerts = import.meta.env.DEV || import.meta.env.VITE_ENABLE_REALTIME_ALERTS === "true"

const getWsUrl = (token: string) => {
  if (typeof window === "undefined") return null
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
}

export const GatewayAlertsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [alerts, setAlerts] = useState<GatewayAlert[]>([])
  const [loading, setLoading] = useState(true)
  const shownToastIds = useRef(new Set<string>())

  const refreshAlerts = useCallback(async () => {
    if (!user) {
      setAlerts([])
      setLoading(false)
      return
    }
    try {
      const data = await apiFetch<GatewayAlert[]>("/api/alerts?status=active&limit=20")
      setAlerts(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refreshAlerts()
  }, [user, refreshAlerts])

  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      refreshAlerts().catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [user, refreshAlerts])

  useEffect(() => {
    if (!enableRealtimeAlerts) return
    const token = getAuthToken()
    const wsUrl = token ? getWsUrl(token) : null
    if (!user || !wsUrl) return

    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === "alert.created" && payload.alert?.id) {
          const alert = payload.alert as GatewayAlert
          setAlerts((prev) => [alert, ...prev.filter((item) => item.id !== alert.id)].slice(0, 20))
          if (!shownToastIds.current.has(alert.id)) {
            shownToastIds.current.add(alert.id)
            if (alert.severity === "critical") {
              toast.error(alert.title, { description: alert.message })
            }
          }
        } else if (payload?.type === "api_key.auto_rotated" || payload?.type === "credential.cooldown") {
          refreshAlerts().catch(() => {})
        }
      } catch {
        // ignore malformed websocket payload
      }
    }
    ws.onclose = () => {}
    return () => ws.close()
  }, [user, refreshAlerts])

  const acknowledgeAlert = async (id: string) => {
    await apiFetch(`/api/alerts/${id}/ack`, { method: "PATCH" })
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  const value = useMemo(
    () => ({
      alerts,
      unreadCount: alerts.length,
      loading,
      acknowledgeAlert,
      refreshAlerts,
    }),
    [alerts, loading, refreshAlerts]
  )

  return <GatewayAlertsContext.Provider value={value}>{children}</GatewayAlertsContext.Provider>
}

export const useGatewayAlerts = () => {
  const context = useContext(GatewayAlertsContext)
  if (!context) throw new Error("useGatewayAlerts must be used within GatewayAlertsProvider")
  return context
}
