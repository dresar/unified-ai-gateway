import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Key,
  ScrollText,
  Settings,
  LogOut,
  Zap,
  Users,
  Import,
  Menu,
  BookOpen,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import AlertsPopover from "@/components/layout/AlertsPopover";

const navItems = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/credentials", label: "Credentials", icon: Key },
  { to: "/clients", label: "Klien API", icon: Users },
  { to: "/import-export", label: "Import/Export", icon: Import },
  { to: "/logs", label: "Log Permintaan", icon: ScrollText },
  { to: "/settings", label: "Pengaturan", icon: Settings },
  { to: "/docs", label: "Dokumentasi", icon: BookOpen },
];

const bottomNavItems = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/credentials", label: "Credential", icon: Key },
  { to: "/clients", label: "API", icon: Users },
  { to: "/docs", label: "Docs", icon: BookOpen },
  { to: "/settings", label: "Pengaturan", icon: Settings },
];

const SidebarContent = ({
  location,
  onNavClick,
  signOut,
  user,
}: {
  location: ReturnType<typeof useLocation>;
  onNavClick?: () => void;
  signOut: () => Promise<void>;
  user: { email?: string } | null;
}) => (
  <>
    <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Zap className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <h1 className="font-heading text-sm font-bold text-sidebar-accent-foreground">Gateway</h1>
        <p className="font-mono text-[10px] text-muted-foreground">v1.0.0</p>
      </div>
    </div>

    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {navItems.map((item) => {
        const isActive = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>

    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 rounded-lg bg-sidebar-accent px-3 py-2">
        <p className="truncate font-mono text-xs text-muted-foreground">{user?.email ?? "—"}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          onNavClick?.();
          signOut();
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  </>
);

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (isMobile) setSheetOpen(false);
  }, [location.pathname, isMobile]);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Mobile: top bar + sheet drawer */}
      {isMobile && (
        <>
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSheetOpen(true)}
              aria-label="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Zap className="h-5 w-5 shrink-0 text-primary" />
              <span className="font-heading text-sm font-bold truncate">Gateway</span>
            </div>
            <AlertsPopover />
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
              title={user?.email ?? "Profil"}
            >
              {(user?.email || user?.displayName || "U").charAt(0).toUpperCase()}
            </div>
          </header>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent
              side="left"
              className="w-[min(18rem,85vw)] border-r border-sidebar-border bg-sidebar p-0 [&>button]:hidden"
            >
              <div className="flex h-full flex-col pt-4">
                <SidebarContent
                  location={location}
                  onNavClick={() => setSheetOpen(false)}
                  signOut={signOut}
                  user={user}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Desktop: fixed sidebar */}
      {!isMobile && (
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <SidebarContent location={location} signOut={signOut} user={user} />
        </aside>
      )}

      {/* Main content: full width on mobile, offset on desktop */}
      <main
        className={cn(
          "min-h-screen flex-1 overflow-x-hidden p-4 pb-8",
          "md:ml-64 md:p-6",
          "w-full min-w-0",
          isMobile && "pb-24",
        )}
      >
        {children}
      </main>

      {/* Mobile: fixed bottom footer (5 menu) */}
      {isMobile && (
        <footer className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
          {bottomNavItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", isActive && "stroke-[2.5]")} />
                <span className="truncate px-0.5 w-full text-center">{item.label}</span>
              </Link>
            );
          })}
        </footer>
      )}
    </div>
  );
};

export default DashboardLayout;
