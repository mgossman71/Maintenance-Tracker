import type { DashboardEquipment } from "@maintenance-tracker/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, LayoutDashboard, Plus } from "lucide-react";
import { useState } from "react";
import { ApiError, api, type EquipmentRow } from "@/api/client";
import { DueChip, dueSummary } from "@/components/due";
import { EmptyState, PageError } from "@/components/empty-state";
import { InterventionForm, type InterventionFormValues } from "@/components/intervention-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { invalidateDashboard, useDashboard, useDashboardMeterActions } from "@/hooks/use-dashboard";
import { formatReading } from "@/lib/format";
import { useTitle } from "@/lib/use-title";

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});

/**
 * The hero screen (§8): per-equipment blocks, overdue first, due-soon
 * amber, stale-meter banners, quick "Done" opening the prefilled
 * record-work form. All verdicts come precomputed from the engine route.
 */
function DashboardPage() {
  useTitle("Dashboard — Maintenance-Tracker");
  const dashboard = useDashboard();
  const [doneTarget, setDoneTarget] = useState<{
    equipment: DashboardEquipment;
    taskId: string;
  } | null>(null);

  if (dashboard.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (dashboard.isError || !dashboard.data)
    return <PageError message="Could not load the dashboard." />;

  const { equipment: blocks, totals } = dashboard.data;

  return (
    <section className="space-y-4" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <Link
          to="/equipment"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Manage equipment
        </Link>
      </div>

      {blocks.length === 0 && (
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

      {blocks.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="dashboard-totals">
          {totals.overdue === 0 && totals.dueSoon === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Everything is on schedule.
            </span>
          ) : (
            <>
              {totals.overdue > 0 && (
                <strong className="text-destructive">
                  {totals.overdue} overdue
                  {totals.dueSoon > 0 ? ` · ${totals.dueSoon} due soon` : ""}
                </strong>
              )}
              {totals.overdue === 0 && totals.dueSoon > 0 && (
                <strong className="text-amber-700 dark:text-amber-400">
                  {totals.dueSoon} due soon
                </strong>
              )}
            </>
          )}
        </p>
      )}

      {blocks.map((block) => (
        <DashboardBlock
          key={block.id}
          block={block}
          onDone={(taskId) => setDoneTarget({ equipment: block, taskId })}
        />
      ))}

      <Dialog open={doneTarget !== null} onClose={() => setDoneTarget(null)} title="Record work">
        {doneTarget !== null && (
          <QuickDone
            block={doneTarget.equipment}
            taskId={doneTarget.taskId}
            onCancel={() => setDoneTarget(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function DashboardBlock({
  block,
  onDone,
}: {
  block: DashboardEquipment;
  onDone: (taskId: string) => void;
}) {
  const unit = block.meterKind === "miles" ? "mi" : block.meterKind === "hours" ? "h" : null;

  return (
    <Card data-testid={`dash-block-${block.id}`}>
      <CardContent className="p-0">
        <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
          <Link
            to="/equipment/$id"
            params={{ id: block.id }}
            className="font-semibold hover:underline"
          >
            {block.icon !== "" ? `${block.icon} ` : ""}
            {block.name}
          </Link>
          <span className="text-sm text-muted-foreground">
            {block.meterKind === "none"
              ? "no meter"
              : block.reading !== null
                ? formatReading(block.reading, block.meterKind)
                : "no reading"}
          </span>
        </div>

        {block.staleMeter && <StaleMeterBanner block={block} />}

        {block.tasks.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No tasks yet — add some from the equipment page.
          </p>
        ) : (
          <ul className="divide-y px-4" data-testid={`dash-tasks-${block.id}`}>
            {block.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 py-2.5"
                data-testid={`dash-task-${task.id}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${
                    task.due.status === "overdue"
                      ? "bg-destructive"
                      : task.due.status === "due-soon"
                        ? "bg-soon"
                        : "bg-ok"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{task.name}</span>
                    <DueChip status={task.due.status} />
                  </div>
                  {dueSummary(task, unit) && (
                    <p className="text-xs text-muted-foreground">{dueSummary(task, unit)}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDone(task.id)}
                  data-testid={`done-${task.id}`}
                  title="Record this as done"
                >
                  <CheckCircle2 /> Done
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The meter-freshness banner (§8): update reading / same reading, inline. */
function StaleMeterBanner({ block }: { block: DashboardEquipment }) {
  const actions = useDashboardMeterActions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const copy =
    block.staleMeter?.reason === "never_recorded"
      ? "No meter reading yet — tasks fall back to time-only tracking until one is recorded."
      : `Meter last read ${block.staleMeter?.daysSince} days ago — due dates drift while it waits.`;

  return (
    <div
      className="mx-4 my-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10"
      data-testid="stale-meter-banner"
    >
      <span className="min-w-0 flex-1">{copy}</span>
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (value !== "" && n >= 0)
              actions.updateReading.mutate(
                { id: block.id, reading: n },
                { onSuccess: () => setEditing(false) },
              );
          }}
        >
          <Input
            type="number"
            min={0}
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={block.reading?.toString() ?? "0"}
            className="w-28"
            data-testid="banner-reading-input"
          />
          <Button type="submit" size="sm" data-testid="banner-reading-submit">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Plus /> Update reading
          </Button>
          {block.reading !== null && (
            <Button
              size="sm"
              variant="ghost"
              disabled={actions.sameReading.isPending}
              onClick={() =>
                actions.sameReading.mutate({ id: block.id, reading: block.reading as number })
              }
              data-testid="banner-same-reading"
            >
              Same reading
            </Button>
          )}
        </>
      )}
      {actions.updateReading.isError && (
        <span className="w-full text-xs text-destructive" data-testid="banner-error">
          {actions.updateReading.error instanceof ApiError &&
          actions.updateReading.error.code === "meter_regressed"
            ? "That is lower than the current reading — correct it from the equipment page."
            : "Could not save the reading."}
        </span>
      )}
    </div>
  );
}

/** Quick "Done" → the same record-work form, prefilled from the block. */
function QuickDone({
  block,
  taskId,
  onCancel,
}: {
  block: DashboardEquipment;
  taskId: string;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(values: InterventionFormValues) {
    setBusy(true);
    setError(null);
    try {
      const { photos, ...input } = values;
      const created = await api.interventions.create(block.id, input);
      for (const file of photos) await api.interventions.addPhoto(created.id, file);
      await qc.invalidateQueries({ queryKey: ["equipment", block.id] });
      void qc.invalidateQueries({ queryKey: ["equipment"] });
      invalidateDashboard(qc);
      onCancel();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <InterventionForm
      equipment={block as unknown as EquipmentRow}
      tasks={block.tasks}
      prefill={{ taskId, ...(block.reading !== null ? { meterAt: block.reading } : {}) }}
      busy={busy}
      error={error}
      onSubmit={(v) => void submit(v)}
      onCancel={onCancel}
      testIdPrefix="quick"
    />
  );
}
