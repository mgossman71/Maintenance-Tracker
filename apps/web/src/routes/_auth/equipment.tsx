import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { EmptyState, PageError } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { equipmentDisplayName, useEquipment } from "@/hooks/use-equipment";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_auth/equipment")({
  component: EquipmentPage,
});

/**
 * M3: list + empty state. Create/edit/delete and meter flows land in M4 —
 * the disabled button keeps the shape honest.
 */
function EquipmentPage() {
  useTitle("Equipment — Maintenance-Tracker");
  const equipment = useEquipment();

  return (
    <section className="space-y-4" data-testid="equipment-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Equipment</h1>
        <Button disabled title="Coming in M4" data-testid="add-equipment-button">
          Add equipment
        </Button>
      </div>

      {equipment.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {equipment.isError && <PageError message="Could not load your equipment." />}
      {equipment.data?.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="No equipment yet"
          description="Cars, boats, mowers, boilers, the house itself. Creating equipment arrives with M4."
        />
      )}
      {(equipment.data?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {equipment.data?.map((eq) => (
            <li key={eq.id}>
              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <span className="font-medium">{equipmentDisplayName(eq)}</span>
                  <span className="text-sm text-muted-foreground">
                    {eq.meterKind === "none" ? "no meter" : `${eq.reading ?? "—"} ${eq.meterKind}`}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
