import { useState } from "react";
import { ApiError, type EquipmentRow, type MeterKind } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { METER_UNIT } from "@/lib/format";

export interface EquipmentFormValues {
  name: string;
  description: string | null;
  icon: string;
  year: number | null;
  meterKind: MeterKind;
  /**
   * The maintenance interval, in the equipment's meter units.
   * - Create: the METER POINT the first service is due at — the parent
   *   makes a "Service" task counting from zero, due there OR in 12 months.
   * - Edit: the recurring interval applied to the equipment's "Service"
   *   task (the count restarts at each service). Blank = leave as it is.
   */
  serviceInterval?: number | null;
}

const METER_KINDS: { value: MeterKind; label: string }[] = [
  { value: "none", label: "No meter — time-based only (house, boiler)" },
  { value: "miles", label: "Miles — cars, trucks, SUVs" },
  { value: "hours", label: "Hours — mowers, engines, machines, boats" },
];

/** Icons offered on the dropdown — one per kind of thing people own. */
const ICON_CHOICES = [
  "🚗",
  "🚙",
  "🚐",
  "🚑",
  "🚒",
  "🚓",
  "🛻",
  "🚚",
  "🚌",
  "🏎️",
  "🚜",
  "🏍️",
  "🛵",
  "🚲",
  "🚤",
  "⛵",
  "🛥️",
  "🚢",
  "⚙️",
  "🔌",
  "🔧",
  "🛠️",
  "⛽",
  "🔥",
  "❄️",
  "💧",
  "🏠",
  "🏡",
  "🏢",
  "🏚️",
  "🌳",
  "🍂",
  "🪚",
  "🧯",
  "🚪",
  "🪟",
  "🚿",
  "🛞",
];

/**
 * Create/edit equipment form. `equipment` present = edit.
 * The form edits EVERYTHING about the equipment, including the maintenance
 * interval (create: the first-service meter point; edit: the recurring
 * interval of the equipment's "Service" task). The meter kind is always
 * selectable; switching units once readings exist asks for confirmation —
 * numbers are kept, only the unit they are read in changes.
 */
export function EquipmentForm({
  equipment,
  serviceIntervalInitial,
  busy,
  error,
  onSubmit,
  onCancel,
  testIdPrefix,
}: {
  equipment?: EquipmentRow;
  /** Edit mode: the Service task's current interval, to prefill the field. */
  serviceIntervalInitial?: number | null;
  busy?: boolean;
  error?: unknown;
  onSubmit: (values: EquipmentFormValues) => void;
  onCancel: () => void;
  testIdPrefix: string;
}) {
  const editing = equipment !== undefined;
  const [name, setName] = useState(equipment?.name ?? "");
  const [icon, setIcon] = useState(
    equipment?.icon != null && equipment.icon !== "" ? equipment.icon : (ICON_CHOICES[0] ?? ""),
  );
  const [year, setYear] = useState(equipment?.year?.toString() ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [meterKind, setMeterKind] = useState<MeterKind>(equipment?.meterKind ?? "none");
  const [serviceInterval, setServiceInterval] = useState(
    serviceIntervalInitial != null ? String(serviceIntervalInitial) : "",
  );
  const [touched, setTouched] = useState(false);
  // a unit switch with readings on the clock needs a second, confirming submit
  const [kindConfirmed, setKindConfirmed] = useState(false);

  const nameError = touched && name.trim() === "" ? "Name is required." : null;
  const unit = meterKind === "miles" ? "miles" : meterKind === "hours" ? "hours" : null;
  const intervalNum = serviceInterval === "" ? null : Number(serviceInterval);
  const badInterval = intervalNum !== null && !(intervalNum > 0);
  const kindSwitch =
    editing && equipment.reading !== null && meterKind !== equipment.meterKind
      ? {
          from:
            equipment.meterKind === "none"
              ? "no meter"
              : METER_UNIT[equipment.meterKind as "miles" | "hours"],
          to: unit ?? "no meter",
        }
      : null;

  // an existing icon that isn't in the curated list still gets shown
  const choices =
    editing && equipment.icon !== "" && !ICON_CHOICES.includes(equipment.icon)
      ? [equipment.icon, ...ICON_CHOICES]
      : ICON_CHOICES;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === "") return;
    if (badInterval) return;
    if (kindSwitch !== null && !kindConfirmed) {
      setKindConfirmed(true); // first click warns; the second one commits
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      icon,
      year: year === "" ? null : Number(year),
      meterKind,
      serviceInterval: unit !== null ? intervalNum : null,
    });
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

  return (
    <form className="space-y-4" onSubmit={submit} data-testid={`${testIdPrefix}-form`}>
      <div className="flex gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-icon`}>Icon</Label>
          <select
            id={`${testIdPrefix}-icon`}
            value={icon}
            onChange={(e) => setIcon(e.target.value ?? "")}
            data-testid={`${testIdPrefix}-icon`}
            className={`${selectClass} w-20 text-center text-lg`}
            aria-label="Icon"
          >
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor={`${testIdPrefix}-name`}>Name</Label>
          <Input
            id={`${testIdPrefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Daily Driver"
            maxLength={200}
            autoFocus
            data-testid={`${testIdPrefix}-name`}
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-year`}>Year</Label>
          <select
            id={`${testIdPrefix}-year`}
            value={year}
            onChange={(e) => setYear(e.target.value ?? "")}
            data-testid={`${testIdPrefix}-year`}
            className={`${selectClass} w-24`}
          >
            <option value="">—</option>
            {yearChoices().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor={`${testIdPrefix}-desc`}>Description</Label>
          <Input
            id={`${testIdPrefix}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="2019 Tacoma, garaged"
            maxLength={2000}
            data-testid={`${testIdPrefix}-desc`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-meter`}>Service Interval</Label>
        <select
          id={`${testIdPrefix}-meter`}
          value={meterKind}
          disabled={busy}
          onChange={(e) => {
            setMeterKind((e.target.value ?? "none") as MeterKind);
            setKindConfirmed(false);
          }}
          data-testid={`${testIdPrefix}-meter`}
          className={selectClass}
        >
          {METER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {kindSwitch !== null && kindConfirmed && (
          <p
            role="alert"
            className="rounded-md border border-amber-300/60 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
            data-testid={`${testIdPrefix}-kind-warning`}
          >
            This switches the unit from <strong>{kindSwitch.from}</strong> to{" "}
            <strong>{kindSwitch.to}</strong>. Readings and history keep their numbers — they are
            simply read as {kindSwitch.to}. Click <strong>Save changes</strong> again to confirm.
          </p>
        )}
        {unit !== null && (
          <div className="space-y-2 pt-1">
            <Label htmlFor={`${testIdPrefix}-interval`}>
              {editing
                ? `Service every (${unit})`
                : `Next service due at ${unit === "miles" ? "mileage" : "hours"}`}
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id={`${testIdPrefix}-interval`}
                type="number"
                min={1}
                step="any"
                value={serviceInterval}
                onChange={(e) => setServiceInterval(e.target.value)}
                placeholder={unit === "miles" ? "1000" : "10"}
                className="w-32"
                data-testid={`${testIdPrefix}-interval`}
              />
              <p className="text-xs text-muted-foreground">
                {editing ? (
                  <>
                    The maintenance interval on the “Service” task — the count restarts at every
                    service. Leave blank to leave it untouched; other tasks keep their own intervals
                    in the Tasks tab.
                  </>
                ) : (
                  <>
                    The meter point the service is due at — enter <strong>1000</strong> for “due at
                    1,000 miles.” Creates a “Service” task due then <em>or</em> in 12 months,
                    whichever comes first.
                  </>
                )}
              </p>
            </div>
            {badInterval && (
              <p
                className="text-sm text-destructive"
                data-testid={`${testIdPrefix}-interval-error`}
              >
                Enter a positive number of {unit}.
              </p>
            )}
          </div>
        )}
        {meterKind === "none" && (
          <p className="text-sm text-muted-foreground">
            No meter: this equipment is tracked by time alone.
          </p>
        )}
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
        <Button
          type="submit"
          disabled={busy || name.trim() === "" || badInterval}
          data-testid={`${testIdPrefix}-submit`}
        >
          {busy ? "Saving…" : equipment ? "Save changes" : "Add equipment"}
        </Button>
      </div>
    </form>
  );
}

/** 1900 … next year (a future model year is normal), computed per render. */
export function yearChoices(): number[] {
  const top = new Date().getFullYear() + 1;
  return Array.from({ length: top - 1900 + 1 }, (_, i) => top - i);
}

/** Server error surfaced under the form; parent passes its mutation error. */
export function FormError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = error.details?.[0]?.message ?? error.code;
  return (
    <p role="alert" className="text-sm text-destructive" data-testid="form-error">
      {message}
    </p>
  );
}
