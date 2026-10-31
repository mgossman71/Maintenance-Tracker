import type { InterventionInfo, TaskWithDue } from "@maintenance-tracker/shared";
import { useState } from "react";
import type { EquipmentRow, InterventionCreateInput } from "@/api/client";
import { FormError } from "@/components/equipment-form";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { METER_UNIT } from "@/lib/format";

export interface InterventionFormValues extends InterventionCreateInput {
  photos: File[];
}

/**
 * Record work (§2): task work or a one-off job; meter capture with the
 * doubt flow (leaving the meter blank is honest — the task stays
 * time-based until a reading arrives); expiry renewals set the next date.
 * `prefill` lets the dashboard's quick "Done" open this same form ready.
 */
export function InterventionForm({
  equipment,
  tasks,
  intervention,
  prefill,
  busy,
  error,
  onSubmit,
  onCancel,
  testIdPrefix,
}: {
  equipment: EquipmentRow;
  tasks: TaskWithDue[];
  intervention?: InterventionInfo;
  prefill?: Partial<InterventionCreateInput>;
  busy?: boolean;
  error?: unknown;
  onSubmit: (values: InterventionFormValues) => void;
  onCancel: () => void;
  testIdPrefix: string;
}) {
  const editing = intervention !== undefined;
  const [target, setTarget] = useState(
    editing
      ? (intervention.taskId ?? "label")
      : prefill?.taskId
        ? prefill.taskId
        : prefill?.label != null
          ? "label"
          : "",
  );
  const [label, setLabel] = useState(editing ? (intervention.label ?? "") : (prefill?.label ?? ""));
  const [date, setDate] = useState(editing ? intervention.date : (prefill?.date ?? today()));
  const [meterAt, setMeterAt] = useState(
    editing ? (intervention.meterAt?.toString() ?? "") : (prefill?.meterAt?.toString() ?? ""),
  );
  const [expiryDate, setExpiryDate] = useState(
    editing ? (intervention.expiryDate ?? "") : (prefill?.expiryDate ?? ""),
  );
  const [location, setLocation] = useState(intervention?.location ?? "");
  const [performedBy, setPerformedBy] = useState(intervention?.performedBy ?? "");
  const [comments, setComments] = useState(intervention?.comments ?? "");
  const [photos, setPhotos] = useState<File[]>([]);

  const selectedTask = tasks.find((t) => t.id === target);
  const isExpiryTask = selectedTask?.kind === "expiry";
  const meterless = equipment.meterKind === "none";
  const unit = meterless ? null : METER_UNIT[equipment.meterKind as "hours" | "miles"];

  const meterNum = meterAt === "" || meterless ? null : Number(meterAt);
  const badMeter = meterNum !== null && !(meterNum >= 0);
  const needsLabel = target === "label" && label.trim() === "";
  const noTarget = !editing && target === "";
  const canSubmit = !noTarget && !needsLabel && !badMeter && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const base: InterventionCreateInput = {
      date,
      meterAt: meterNum,
      location: location.trim() === "" ? null : location.trim(),
      performedBy: performedBy.trim() === "" ? null : performedBy.trim(),
      comments: comments.trim() === "" ? null : comments.trim(),
      expiryDate: isExpiryTask && expiryDate !== "" ? expiryDate : null,
    };
    if (editing) {
      onSubmit({ ...base, taskId: null, label: intervention.label ?? "", photos: [] });
      return;
    }
    if (target === "label") onSubmit({ ...base, label: label.trim(), photos });
    else onSubmit({ ...base, taskId: target, photos });
  }

  return (
    <form className="space-y-4" onSubmit={submit} data-testid={`${testIdPrefix}-intervention-form`}>
      {!editing && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-target`}>What was done?</Label>
          <select
            id={`${testIdPrefix}-target`}
            value={target}
            onChange={(e) => setTarget(e.target.value ?? "")}
            data-testid={`${testIdPrefix}-target`}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a task…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.kind === "expiry" ? " (expiry)" : ""}
              </option>
            ))}
            <option value="label">One-off job (no task)…</option>
          </select>
        </div>
      )}
      {editing && (
        <p className="text-sm text-muted-foreground">
          {intervention.label !== null
            ? intervention.label
            : tasks.find((t) => t.id === intervention.taskId)?.name}
          {" — "}
          {intervention.taskId === null ? "one-off job" : "task work"} is fixed at creation.
        </p>
      )}

      {target === "label" && !editing && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-label`}>Job</Label>
          <Input
            id={`${testIdPrefix}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Detailing, winter storage…"
            maxLength={200}
            data-testid={`${testIdPrefix}-label`}
          />
          {needsLabel && <p className="text-sm text-destructive">Name the job.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-date`}>Date</Label>
          <Input
            id={`${testIdPrefix}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            data-testid={`${testIdPrefix}-date`}
          />
        </div>
        {!meterless && (
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-meter`}>Meter at the time ({unit})</Label>
            <Input
              id={`${testIdPrefix}-meter`}
              type="number"
              min={0}
              step="any"
              value={meterAt}
              onChange={(e) => setMeterAt(e.target.value)}
              placeholder={equipment.reading?.toString() ?? "0"}
              className="w-40"
              data-testid={`${testIdPrefix}-meter`}
            />
          </div>
        )}
      </div>
      {!meterless && meterAt === "" && (
        <p className="text-sm text-muted-foreground" data-testid={`${testIdPrefix}-doubt-hint`}>
          Not sure of the exact number? Leave it blank — the job is recorded without a meter
          reading, and meter-based tasks will ask for one before trusting their countdown.
        </p>
      )}
      {!meterless &&
        meterNum !== null &&
        equipment.reading !== null &&
        meterNum > equipment.reading && (
          <p className="text-sm text-muted-foreground">
            This moves the meter from {equipment.reading.toLocaleString("en-US")} to{" "}
            {meterNum.toLocaleString("en-US")} {unit}.
          </p>
        )}
      {badMeter && <p className="text-sm text-destructive">Meter reading cannot be negative.</p>}

      {isExpiryTask && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-expiry`}>New expiry date</Label>
          <Input
            id={`${testIdPrefix}-expiry`}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-44"
            data-testid={`${testIdPrefix}-expiry`}
          />
          <p className="text-xs text-muted-foreground">
            Renewing the work moves {selectedTask?.name}'s expiry to this date.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor={`${testIdPrefix}-by`}>Performed by</Label>
          <Input
            id={`${testIdPrefix}-by`}
            value={performedBy}
            onChange={(e) => setPerformedBy(e.target.value)}
            placeholder="Me, shop…"
            maxLength={200}
            data-testid={`${testIdPrefix}-by`}
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor={`${testIdPrefix}-location`}>Location</Label>
          <Input
            id={`${testIdPrefix}-location`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Home garage…"
            maxLength={200}
            data-testid={`${testIdPrefix}-location`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-comments`}>Comments</Label>
        <Input
          id={`${testIdPrefix}-comments`}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="5W-30, filter OEM…"
          maxLength={4000}
          data-testid={`${testIdPrefix}-comments`}
        />
      </div>

      {!editing && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-photos`}>Photos</Label>
          <input
            id={`${testIdPrefix}-photos`}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
            data-testid={`${testIdPrefix}-photos`}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, GIF or WEBP — checked by content, not by name.
          </p>
        </div>
      )}

      <FormError error={error} />

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
          data-testid={`${testIdPrefix}-cancel`}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} data-testid={`${testIdPrefix}-submit`}>
          {busy ? "Saving…" : editing ? "Save work" : "Record work"}
        </Button>
      </div>
    </form>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
