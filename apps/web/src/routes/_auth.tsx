import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Moon,
  Settings,
  Sun,
  Wrench,
} from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { queryClient } from "@/router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  /** The gate (build-plan §9 M2): no shell, no data, without a live session. */
  beforeLoad: async () => {
    try {
      await queryClient.fetchQuery({ queryKey: ["session"], queryFn: api.session });
    } catch {
      throw redirect({ to: "/login" });
    }
  },
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/equipment", label: "Equipment", icon: Boxes },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <Header />
      <main className="flex-1 px-4 pt-4 pb-24 md:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const queryClientRef = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClientRef.clear();
      void navigate({ to: "/login" });
    },
  });

  return (
    <header className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <Wrench className="size-5 text-primary" aria-hidden="true" />
        <span className="font-semibold tracking-tight">Maintenance-Tracker</span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Log out"
          title="Log out"
          onClick={() => logout.mutate()}
          data-testid="logout-button"
        >
          <LogOut />
        </Button>
      </div>
    </header>
  );
}

const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Light theme",
  dark: "Dark theme",
  auto: "Theme follows system",
};

function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : MonitorSmartphone;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={THEME_LABEL[mode]}
      title={THEME_LABEL[mode]}
      onClick={cycle}
      data-testid="theme-toggle"
    >
      <Icon />
    </Button>
  );
}

/** Mobile-first bottom tab bar (build-plan §8). */
function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur md:static md:border-t-0 md:bg-transparent md:pt-2"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-3xl justify-around md:justify-center md:gap-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-0.5 rounded-md px-4 py-2 text-xs font-medium transition-colors md:flex-row md:gap-2 md:text-sm"
            activeProps={{ className: "text-primary underline underline-offset-4" }}
            inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
