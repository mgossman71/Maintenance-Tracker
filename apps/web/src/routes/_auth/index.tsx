import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { EmptyState, PageError } from "@/components/empty-state";
import { useEquipment } from "@/hooks/use-equipment";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});

/**
 * The hero screen is M7 — M3 ships its empty state, honestly labeled.
 * Empty vs "not yet wired" are deliberately different messages.
 */
function DashboardPage() {
  useTitle("Dashboard — Maintenance-Tracker");
  const equipment = useEquipment();

  return (
    <section className="space-y-4" data-testid="dashboard-page">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      {equipment.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {equipment.isError && <PageError message="Could not load your equipment." />}
      {equipment.data?.length === 0 && (
        <EmptyState
          icon={LayoutDashboard}
          title="Nothing to track yet"
          description="Add your first piece of equipment — a car, a boat, the house — and its maintenance will show up here, overdue first."
        >
          <Link
            to="/equipment"
            className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add equipment
          </Link>
        </EmptyState>
      )}
      {(equipment.data?.length ?? 0) > 0 && (
        <EmptyState
          icon={LayoutDashboard}
          title={`${equipment.data?.length} piece${equipment.data?.length === 1 ? "" : "s"} of equipment tracked`}
          description="The overdue / due-soon dashboard arrives at milestone M7. Until then, the Equipment tab lists everything."
        />
      )}
    </section>
  );
}
