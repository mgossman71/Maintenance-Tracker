import { createFileRoute } from "@tanstack/react-router";
import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { SecurityPane } from "@/components/security-pane";
import { TaskLibraryPane } from "@/components/task-library-pane";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ThemeMode, useTheme } from "@/lib/theme";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});

/** Settings (§8): Appearance · Security · Task library · About. */
function SettingsPage() {
  useTitle("Settings — Maintenance-Tracker");
  return (
    <section className="space-y-4" data-testid="settings-page">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <AppearancePane />
      <SecurityPane />
      <TaskLibraryPane />
      <AboutPane />
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

function AboutPane() {
  return (
    <Card data-testid="about-pane">
      <CardHeader>
        <CardTitle className="text-base">About</CardTitle>
        <CardDescription>
          Maintenance-Tracker v{__APP_VERSION__} — self-hosted maintenance tracking for the things
          you own: cars, boats, machines, the house.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>
          Single user, one master password, no accounts and no third-party calls. Everything — the
          database and your uploaded files — lives on this server under the data directory you
          configured.
        </p>
        <p>
          The theme is a per-device preference; everything else is shared and stored server-side.
        </p>
      </CardContent>
    </Card>
  );
}
