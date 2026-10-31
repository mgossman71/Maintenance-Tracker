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
  meterKind: MeterKind;
}

const METER_KINDS: { value: MeterKind; label: string }[] = [
  { value: "none", label: "No meter — time-based only (house, boiler)" },
  { value: "miles", label: "Mileometer — miles (cars, mowers)" },
  { value: "hours", label: "Hour meter — hours (engines, machines)" },
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
  const [name, setName] = useState(equipment?.name ?? "");
  const [icon, setIcon] = useState(equipment?.icon ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [meterKind, setMeterKind] = useState<MeterKind>(equipment?.meterKind ?? "none");
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim() === "" ? "Name is required." : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === "") return;
    onSubmit({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      icon: icon.trim(),
      meterKind,
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit} data-testid={`${testIdPrefix}-form`}>
      <div className="flex gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-icon`}>Icon</Label>
          <Input
            id={`${testIdPrefix}-icon`}
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 16))}
            placeholder="🚗"
            className="w-20 text-center text-xl"
            data-testid={`${testIdPrefix}-icon`}
          />
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

      <div className="space-y-2">
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

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-meter`}>Meter</Label>
        <select
          id={`${testIdPrefix}-meter`}
          value={meterKind}
          disabled={meterKindLocked || busy}
          onChange={(e) => setMeterKind(e.target.value as MeterKind)}
          data-testid={`${testIdPrefix}-meter`}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
          disabled={busy || name.trim() === ""}
          data-testid={`${testIdPrefix}-submit`}
        >
          {busy ? "Saving…" : equipment ? "Save changes" : "Add equipment"}
        </Button>
      </div>
    </form>
  );
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
