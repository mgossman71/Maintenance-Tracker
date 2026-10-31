import { createFileRoute } from "@tanstack/react-router";
import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { TaskLibraryPane } from "@/components/task-library-pane";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});

/**
 * M3: the Appearance pane (theme, persisted) is real; Security and Task
 * library panes arrive in M8 and are shown as such.
 */
function SettingsPage() {
  useTitle("Settings — Maintenance-Tracker");
  return (
    <section className="space-y-4" data-testid="settings-page">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <AppearancePane />
      <ComingSoonPane title="Security" body="Change master password — M8." />
      <TaskLibraryPane />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
          <CardDescription>
            Maintenance-Tracker — milestone M3. Self-hosted, single-user, one master password.
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}

const MODES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "auto", label: "Auto", icon: MonitorSmartphone },
];

function AppearancePane() {
  const { mode, setMode } = useTheme();
  return (
    <Card data-testid="appearance-pane">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Light, dark, or follow the system. Saved on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* no semantic equivalent for a segmented toggle group */}
        {/* biome-ignore lint/a11y/useSemanticElements: role=group is the semantics here */}
        <div className="inline-flex rounded-lg border p-1" role="group" aria-label="Theme">
          {MODES.map(({ mode: m, label, icon: Icon }) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              data-testid={`theme-${m}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-secondary text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ComingSoonPane({ title, body }: { title: string; body: string }) {
  return (
    <Card className="opacity-70">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}
