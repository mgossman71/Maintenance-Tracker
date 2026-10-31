import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type EquipmentRow } from "@/api/client";
import { EmptyState, PageError } from "@/components/empty-state";
import { EquipmentForm, type EquipmentFormValues } from "@/components/equipment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { equipmentDisplayName, useEquipment, useEquipmentMutations } from "@/hooks/use-equipment";
import { daysAgo, formatReading } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_auth/equipment/")({
  component: EquipmentPage,
});

function EquipmentPage() {
  useTitle("Equipment — Maintenance-Tracker");
  const equipment = useEquipment();
  const [creating, setCreating] = useState(false);

  return (
    <section className="space-y-4" data-testid="equipment-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Equipment</h1>
        <Button onClick={() => setCreating(true)} data-testid="add-equipment-button">
          <Plus /> Add equipment
        </Button>
      </div>

      {equipment.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {equipment.isError && <PageError message="Could not load your equipment." />}
      {equipment.data?.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="No equipment yet"
          description="Cars, boats, mowers, boilers, the house itself — anything with maintenance to track."
        >
          <Button onClick={() => setCreating(true)} className="mt-2" data-testid="empty-add-button">
            <Plus /> Add your first piece of equipment
          </Button>
        </EmptyState>
      )}
      {(equipment.data?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {equipment.data?.map((eq) => (
            <li key={eq.id}>
              <EquipmentRowCard equipment={eq} />
            </li>
          ))}
        </ul>
      )}

      <CreateEquipmentDialog open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}

function meterSummary(eq: EquipmentRow): string {
  if (eq.meterKind === "none") return "no meter";
  if (eq.reading === null) return `${eq.meterKind === "miles" ? "mi" : "h"} meter — no reading yet`;
  return `${formatReading(eq.reading, eq.meterKind)}${
    eq.readingUpdatedAt ? ` · ${daysAgo(eq.readingUpdatedAt)}` : ""
  }`;
}

function EquipmentRowCard({ equipment: eq }: { equipment: EquipmentRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mutations = useEquipmentMutations();

  function save(values: EquipmentFormValues) {
    const { serviceInterval: _si, ...patch } = values;
    mutations.update.mutate({ id: eq.id, patch });
    setEditing(false);
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-2 p-4">
          <Link
            to="/equipment/$id"
            params={{ id: eq.id }}
            className="flex flex-1 items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`equipment-link-${eq.id}`}
          >
            <span className="font-medium">{equipmentDisplayName(eq)}</span>
            <span className="text-sm text-muted-foreground">{meterSummary(eq)}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${eq.name}`}
            onClick={() => setEditing(true)}
            data-testid={`edit-equipment-${eq.id}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${eq.name}`}
            onClick={() => setDeleting(true)}
            data-testid={`delete-equipment-${eq.id}`}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit equipment">
        <EquipmentForm
          equipment={eq}
          meterKindLocked={eq.reading !== null}
          busy={mutations.update.isPending}
          error={mutations.update.error}
          onSubmit={save}
          onCancel={() => setEditing(false)}
          testIdPrefix="edit"
        />
      </Dialog>

      <ConfirmDialog
        open={deleting}
        title="Delete equipment?"
        confirmLabel="Delete"
        busy={mutations.remove.isPending}
        description={
          <>
            <strong>{equipmentDisplayName(eq)}</strong> and everything attached to it — tasks,
            history and readings — will be permanently deleted. This cannot be undone.
          </>
        }
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          mutations.remove.mutate(eq.id, { onSuccess: () => setDeleting(false) });
        }}
      />
    </>
  );
}

function CreateEquipmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function create(values: EquipmentFormValues) {
    setBusy(true);
    setError(null);
    try {
      const { serviceInterval, ...input } = values;
      const eq = await api.equipment.create(input);
      // the form's field is the METER POINT the first service is due AT:
      // counting from zero, interval = that point → due exactly there (OR
      // in 12 months, whichever comes first); stays editable in the Tasks tab
      if (serviceInterval != null && input.meterKind !== undefined && input.meterKind !== "none") {
        await api.equipment.createTask(eq.id, {
          name: "Service",
          kind: "interval",
          monthsInterval: 12,
          meterInterval: serviceInterval,
          baselineMeter: 0,
        });
      }
      await qc.invalidateQueries({ queryKey: ["equipment"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add equipment">
      {/* mounted only while open so the form starts blank every time */}
      {open && (
        <EquipmentForm
          busy={busy}
          error={error}
          onSubmit={(v) => void create(v)}
          onCancel={onClose}
          testIdPrefix="create"
        />
      )}
    </Dialog>
  );
}
