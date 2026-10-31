import { Lock } from "lucide-react";
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
   * Create-mode shortcut: the METER POINT (odometer/hour-meter reading) at
   * which the first service is due — NOT an interval. The parent turns it
   * into a "Service" task counting from zero, due at that reading OR
   * 12 months, whichever comes first.
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
 * `meterKindLocked`: the server refuses meter-kind changes once readings
 * exist (§4) — the select is disabled, with the reason shown, rather than
 * failing on submit.
 */
export function EquipmentForm({
  equipment,
  meterKindLocked,
  busy,
  error,
  onSubmit,
  onCancel,
  testIdPrefix,
}: {
  equipment?: EquipmentRow;
  meterKindLocked?: boolean;
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
  const [serviceInterval, setServiceInterval] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim() === "" ? "Name is required." : null;
  const unit = meterKind === "miles" ? "miles" : meterKind === "hours" ? "hours" : null;
  const intervalNum = serviceInterval === "" ? null : Number(serviceInterval);
  const badInterval = intervalNum !== null && !(intervalNum > 0);

  // an existing icon that isn't in the curated list still gets shown
  const choices =
    editing && equipment.icon !== "" && !ICON_CHOICES.includes(equipment.icon)
      ? [equipment.icon, ...ICON_CHOICES]
      : ICON_CHOICES;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === "") return;
    onSubmit({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      icon,
      year: year === "" ? null : Number(year),
      meterKind,
      serviceInterval: !editing && unit !== null ? intervalNum : null,
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
          disabled={meterKindLocked || busy}
          onChange={(e) => setMeterKind((e.target.value ?? "none") as MeterKind)}
          data-testid={`${testIdPrefix}-meter`}
          className={selectClass}
        >
          {METER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {meterKindLocked && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Locked at{" "}
            {equipment && equipment.meterKind !== "none" ? METER_UNIT[equipment.meterKind] : "none"}{" "}
            — readings already exist for this equipment.
          </p>
        )}
        {!editing && unit !== null && (
          <div className="space-y-2 pt-1">
            <Label htmlFor={`${testIdPrefix}-interval`}>
              Next service due at {unit === "miles" ? "mileage" : "hours"}
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
                The meter point the service is due at — enter <strong>1000</strong> for “due at
                1,000 miles.” Creates a “Service” task due then <em>or</em> in 12 months, whichever
                comes first. Recurring intervals live on tasks in the Tasks tab.
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
        {editing && (
          <p className="text-sm text-muted-foreground">
            The unit this equipment counts services in. Intervals live on each task — set them in
            the Tasks tab.
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
  const message =
    error.code === "meter_kind_immutable"
      ? "The meter kind was locked once readings were recorded."
      : (error.details?.[0]?.message ?? error.code);
  return (
    <p role="alert" className="text-sm text-destructive" data-testid="form-error">
      {message}
    </p>
  );
}
