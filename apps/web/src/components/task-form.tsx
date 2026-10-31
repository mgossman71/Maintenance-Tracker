import type { TaskPresetInfo, TaskWithDue } from "@maintenance-tracker/shared";
import { Lock } from "lucide-react";
import { useState } from "react";
import type { EquipmentRow, TaskCreateInput } from "@/api/client";
import { FormError } from "@/components/equipment-form";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { METER_UNIT } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TaskKindChoice = "interval" | "expiry";

/**
 * Add/edit task (build-plan §2):
 * - Add mode opens on the task LIBRARY: choosing a preset prefills name +
 *   intervals, both still editable; Custom… starts from scratch.
 * - kind is fixed at creation (§4) — when editing it is shown, not chosen.
 * - meter intervals require metered equipment (validated on the server too).
 */
export function TaskForm({
  equipment,
  task,
  presets,
  busy,
  error,
  onSubmit,
  onCancel,
  testIdPrefix,
}: {
  equipment: EquipmentRow;
  task?: TaskWithDue;
  presets: TaskPresetInfo[];
  busy?: boolean;
  error?: unknown;
  onSubmit: (values: TaskCreateInput) => void;
  onCancel: () => void;
  testIdPrefix: string;
}) {
  const editing = task !== undefined;
  const [presetId, setPresetId] = useState(editing ? "custom" : "");
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [kind, setKind] = useState<TaskKindChoice>(task?.kind ?? "interval");
  const [months, setMonths] = useState(task?.monthsInterval?.toString() ?? "");
  const [meter, setMeter] = useState(task?.meterInterval?.toString() ?? "");
  const [expiryDate, setExpiryDate] = useState(task?.currentExpiryDate ?? "");

  const meterless = equipment.meterKind === "none";
  const unit = meterless ? null : METER_UNIT[equipment.meterKind as "hours" | "miles"];

  function pickPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (!preset) return; // "" or custom — leave the fields as they are
    setName(preset.name);
    setMonths(preset.monthsInterval?.toString() ?? "");
    setMeter(preset.meterInterval?.toString() ?? "");
    setKind("interval");
  }

  const monthsNum = months === "" ? null : Number(months);
  const meterNum = meter === "" || meterless ? null : Number(meter);
  const badMonths = monthsNum !== null && (!Number.isInteger(monthsNum) || monthsNum < 1);
  const badMeter = meterNum !== null && (!(meterNum > 0) || Number.isNaN(meterNum));

  const intervalMissing = kind === "interval" && monthsNum === null && meterNum === null;
  const expiryMissing = kind === "expiry" && expiryDate === "";
  const nameMissing = name.trim() === "";
  const invalid = badMonths || badMeter;
  const canSubmit = !nameMissing && !invalid && !intervalMissing && !expiryMissing && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      kind,
      ...(kind === "interval"
        ? {
            monthsInterval: monthsNum,
            meterInterval: meterNum,
            currentExpiryDate: null,
          }
        : { monthsInterval: null, meterInterval: null, currentExpiryDate: expiryDate }),
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit} data-testid={`${testIdPrefix}-form`}>
      {!editing && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-preset`}>From library</Label>
          <select
            id={`${testIdPrefix}-preset`}
            value={presetId}
            onChange={(e) => pickPreset(e.target.value ?? "")}
            data-testid={`${testIdPrefix}-preset`}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a task preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {describeIntervals(p, unit)}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Presets prefill name and intervals — edit anything before saving.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-name`}>Task name</Label>
        <Input
          id={`${testIdPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Oil change"
          maxLength={200}
          autoFocus
          data-testid={`${testIdPrefix}-task-name`}
        />
        {nameMissing && presetId !== "" && (
          <p className="text-sm text-destructive">Name is required.</p>
        )}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: two-option kind switch; no semantic equivalent */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Task kind">
        {(["interval", "expiry"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            disabled={editing}
            onClick={() => setKind(k)}
            data-testid={`${testIdPrefix}-kind-${k}`}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
              kind === k ? "bg-secondary text-foreground" : "text-muted-foreground",
              editing && "cursor-not-allowed opacity-60",
            )}
          >
            {k === "interval" ? "Interval (every N months / units)" : "Expiry (expires on date)"}
          </button>
        ))}
        {editing && (
          <span className="flex items-center gap-1 self-center text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" /> kind is fixed at creation
          </span>
        )}
      </div>

      {kind === "interval" && (
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-months`}>Every (months)</Label>
            <Input
              id={`${testIdPrefix}-months`}
              type="number"
              min={1}
              step={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              placeholder="12"
              className="w-32"
              data-testid={`${testIdPrefix}-months`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-meter`}>Every{unit ? ` (${unit})` : " (meter)"}</Label>
            <Input
              id={`${testIdPrefix}-meter`}
              type="number"
              min={0}
              step="any"
              value={meter}
              onChange={(e) => setMeter(e.target.value)}
              placeholder="5000"
              className="w-32"
              disabled={meterless}
              data-testid={`${testIdPrefix}-meter`}
            />
          </div>
        </div>
      )}
      {kind === "interval" && meterless && (
        <p className="text-sm text-muted-foreground">
          {equipment.name} has no meter — this task will be time-based only.
        </p>
      )}
      {kind === "interval" && intervalMissing && (
        <p className="text-sm text-destructive">
          Set at least one interval — months{unit ? ` or ${unit}` : ""}.
        </p>
      )}
      {badMonths && <p className="text-sm text-destructive">Months must be a whole number ≥ 1.</p>}
      {badMeter && <p className="text-sm text-destructive">Meter interval must be above 0.</p>}

      {kind === "expiry" && (
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-expiry`}>Expires on</Label>
          <Input
            id={`${testIdPrefix}-expiry`}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-44"
            data-testid={`${testIdPrefix}-expiry`}
          />
          {expiryMissing && (
            <p className="text-sm text-destructive">An expiry task needs a date.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-desc`}>Description</Label>
        <Input
          id={`${testIdPrefix}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional note"
          maxLength={2000}
          data-testid={`${testIdPrefix}-task-desc`}
        />
      </div>

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
        <Button type="submit" disabled={!canSubmit} data-testid={`${testIdPrefix}-task-submit`}>
          {busy ? "Saving…" : editing ? "Save task" : "Add task"}
        </Button>
      </div>
    </form>
  );
}

function describeIntervals(preset: TaskPresetInfo, unit: string | null): string {
  const bits: string[] = [];
  if (preset.monthsInterval != null) bits.push(`${preset.monthsInterval} mo`);
  if (preset.meterInterval != null)
    bits.push(`${preset.meterInterval.toLocaleString("en-US")}${unit ? ` ${unit}` : " units"}`);
  return bits.length > 0 ? ` — ${bits.join(" / ")}` : "";
}
