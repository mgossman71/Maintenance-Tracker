import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gauge, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError, type EquipmentRow } from "@/api/client";
import { PageError } from "@/components/empty-state";
import { EquipmentForm, type EquipmentFormValues } from "@/components/equipment-form";
import { TasksPane } from "@/components/tasks-pane";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  equipmentDisplayName,
  useEquipmentById,
  useEquipmentMutations,
} from "@/hooks/use-equipment";
import { daysAgo, formatReading, METER_UNIT } from "@/lib/format";
import { useTitle } from "@/lib/use-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_auth/equipment/$id")({
  component: EquipmentDetailPage,
});

const TABS = [
  { id: "info", label: "Info" },
  { id: "tasks", label: "Tasks" },
  { id: "history", label: "History" },
  { id: "documents", label: "Documents" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function EquipmentDetailPage() {
  const { id } = Route.useParams();
  const equipment = useEquipmentById(id);
  const [tab, setTab] = useState<TabId>("info");
  useTitle(equipment.data ? `${equipment.data.name} — Maintenance-Tracker` : "Equipment");

  if (equipment.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (equipment.isError || !equipment.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <PageError message="That equipment doesn't exist — it may have been deleted." />
      </div>
    );
  }
  const eq = equipment.data;

  return (
    <section className="space-y-4" data-testid="equipment-detail">
      <BackLink />
      <h1 className="text-xl font-semibold tracking-tight" data-testid="equipment-title">
        {equipmentDisplayName(eq)}
      </h1>

      <div className="flex gap-1 border-b" role="tablist" aria-label="Equipment sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <InfoPane eq={eq} />}
      {tab === "tasks" && <TasksPane equipment={eq} />}
      {tab === "history" && <PlaceholderPane what="History" milestone="M6" />}
      {tab === "documents" && <PlaceholderPane what="Documents" milestone="M6" />}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/equipment"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Equipment
    </Link>
  );
}

function PlaceholderPane({ what, milestone }: { what: string; milestone: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {what} arrive in milestone {milestone}.
      </CardContent>
    </Card>
  );
}

function InfoPane({ eq }: { eq: EquipmentRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const mutations = useEquipmentMutations();

  function save(values: EquipmentFormValues) {
    mutations.update.mutate(
      { id: eq.id, patch: values },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => {
          // meter_kind_immutable means a reading landed while the dialog was
          // open — close it so the lock state refreshes from the server.
          if (err instanceof ApiError && err.code === "meter_kind_immutable") setEditing(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <MeterPane eq={eq} />

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">Details</CardTitle>
            {eq.description && <CardDescription>{eq.description}</CardDescription>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid="edit-open"
          >
            <Pencil /> Edit
          </Button>
        </CardHeader>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Deleting removes this equipment and its tasks, history and readings.
            </CardDescription>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleting(true)}
            data-testid="delete-open"
          >
            <Trash2 /> Delete
          </Button>
        </CardHeader>
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
        description={<>Everything attached to {equipmentDisplayName(eq)} goes with it. Forever.</>}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          mutations.remove.mutate(eq.id, {
            onSuccess: () => void navigate({ to: "/equipment" }),
          })
        }
      />
    </div>
  );
}

/**
 * The meter flows (§2): update, "same reading", and explicit correction.
 * A LOWER reading is never sent casually — the form switches into a
 * clearly-labeled correction confirmation the user must acknowledge.
 */
function MeterPane({ eq }: { eq: EquipmentRow }) {
  const mutations = useEquipmentMutations();
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [confirmingCorrection, setConfirmingCorrection] = useState(false);

  if (eq.meterKind === "none") {
    return (
      <Card data-testid="meter-pane">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-muted-foreground" aria-hidden="true" /> Meter
          </CardTitle>
          <CardDescription>
            No meter — tasks on this equipment are time-based. Give it a meter from Edit (possible
            until the first reading).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const unit = METER_UNIT[eq.meterKind];
  const parsed = value === "" ? null : Number(value);
  const invalid = parsed !== null && (Number.isNaN(parsed) || parsed < 0);
  const lowers = parsed !== null && eq.reading !== null && parsed < eq.reading;
  const canSubmit = parsed !== null && !invalid && !mutations.setReading.isPending;

  function send(correct = false) {
    if (parsed === null) return;
    mutations.setReading.mutate(
      {
        id: eq.id,
        reading: parsed,
        opts: { ...(date !== "" ? { date } : {}), ...(correct ? { correct: true } : {}) },
      },
      { onSuccess: () => setValue("") },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // the never-lower rule as a UI gate: below-current needs explicit ack
    if (lowers) setConfirmingCorrection(true);
    else send();
  }

  return (
    <Card data-testid="meter-pane">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4" aria-hidden="true" /> Current reading
        </CardTitle>
        <CardDescription data-testid="meter-current">
          {eq.reading === null ? (
            "No reading recorded yet."
          ) : (
            <>
              <strong>{formatReading(eq.reading, eq.meterKind)}</strong>
              {eq.readingUpdatedAt ? ` · recorded ${daysAgo(eq.readingUpdatedAt)}` : ""}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="reading-input">New reading ({unit})</Label>
            <Input
              id="reading-input"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setConfirmingCorrection(false);
              }}
              placeholder={eq.reading === null ? `0` : String(eq.reading)}
              className="w-36"
              data-testid="reading-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reading-date">Date</Label>
            <Input
              id="reading-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
              data-testid="reading-date"
            />
          </div>
          <Button type="submit" disabled={!canSubmit} data-testid="reading-submit">
            {eq.reading === null ? "Record reading" : "Update reading"}
          </Button>
          {eq.reading !== null && (
            <Button
              type="button"
              variant="outline"
              disabled={mutations.setReading.isPending}
              onClick={() =>
                eq.reading !== null &&
                mutations.setReading.mutate({ id: eq.id, reading: eq.reading })
              }
              data-testid="same-reading-button"
            >
              <RotateCcw /> Same reading
            </Button>
          )}
        </form>

        {invalid && <p className="text-sm text-destructive">Enter a number of {unit} ≥ 0.</p>}

        {confirmingCorrection && lowers && (
          <div
            className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            data-testid="correction-confirm"
            role="alertdialog"
            aria-label="Confirm reading correction"
          >
            <p className="text-sm font-medium">Correct the recorded reading?</p>
            <p className="text-sm text-muted-foreground">
              {formatReading(eq.reading as number, eq.meterKind)} will be replaced with{" "}
              {formatReading(parsed as number, eq.meterKind)}. Readings only go backwards to fix a
              mistake — tasks that use the meter will recompute from the corrected value.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={mutations.setReading.isPending}
                onClick={() => {
                  send(true);
                  setConfirmingCorrection(false);
                  setValue("");
                }}
                data-testid="correction-confirm-button"
              >
                Yes, correct it
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingCorrection(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mutations.setReading.isError && (
          <p role="alert" className="text-sm text-destructive" data-testid="meter-error">
            {readingErrorMessage(mutations.setReading.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function readingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "meter_regressed") {
      return "That is lower than the current reading — use the correction flow.";
    }
    if (err.code === "meterless_equipment") return "This equipment has no meter.";
  }
  return "Could not save the reading. Try again.";
}
