import type { TaskPresetInfo } from "@maintenance-tracker/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TaskPresetInput } from "@/api/client";
import { PageError } from "@/components/empty-state";
import { FormError } from "@/components/equipment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { usePresetMutations, usePresets } from "@/hooks/use-tasks";

/**
 * Task library (§2): editable presets, seeded with generic car/boat/home
 * starters on first run. Deleting the whole library is allowed — the seed
 * will not come back.
 */
export function TaskLibraryPane() {
  const presets = usePresets();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TaskPresetInfo | null>(null);
  const [deleting, setDeleting] = useState<TaskPresetInfo | null>(null);

  return (
    <Card data-testid="task-library-pane">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Task library</CardTitle>
          <CardDescription>
            Presets the “Add task” picker offers. Intervals prefill the form — still editable.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          data-testid="add-preset-button"
        >
          <Plus /> Preset
        </Button>
      </CardHeader>
      <CardContent>
        {presets.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {presets.isError && <PageError message="Could not load the task library." />}
        {presets.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            The library is empty. Add presets or build tasks custom.
          </p>
        )}
        {(presets.data?.length ?? 0) > 0 && (
          <ul className="divide-y">
            {presets.data?.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 py-2"
                data-testid={`preset-row-${p.id}`}
              >
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <span
                  className="text-sm text-muted-foreground"
                  data-testid={`preset-intervals-${p.id}`}
                >
                  {presetIntervals(p)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setEditing(p)}
                  data-testid={`edit-preset-${p.id}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => setDeleting(p)}
                  data-testid={`delete-preset-${p.id}`}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PresetDialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add preset"
        testIdPrefix="create"
        mutation="create"
      />
      <PresetDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit “${editing.name}”` : "Edit preset"}
        preset={editing ?? undefined}
        testIdPrefix="edit"
        mutation="update"
      />
      <DeletePresetDialog preset={deleting} onClose={() => setDeleting(null)} />
    </Card>
  );
}

function presetIntervals(p: TaskPresetInfo): string {
  const bits: string[] = [];
  if (p.monthsInterval != null) bits.push(`${p.monthsInterval} mo`);
  if (p.meterInterval != null) bits.push(`${p.meterInterval.toLocaleString("en-US")} units`);
  return bits.join(" / ");
}

function PresetDialog({
  open,
  onClose,
  title,
  preset,
  testIdPrefix,
  mutation,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  preset?: TaskPresetInfo;
  testIdPrefix: string;
  mutation: "create" | "update";
}) {
  const mutations = usePresetMutations();
  const active = mutations[mutation];

  function save(values: TaskPresetInput) {
    if (mutation === "create") {
      mutations.create.mutate(values, { onSuccess: onClose });
    } else if (preset) {
      mutations.update.mutate({ id: preset.id, patch: values }, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && (
        <PresetForm
          preset={preset}
          busy={active.isPending}
          error={active.error}
          onSubmit={save}
          onCancel={onClose}
          testIdPrefix={testIdPrefix}
        />
      )}
    </Dialog>
  );
}

function DeletePresetDialog({
  preset,
  onClose,
}: {
  preset: TaskPresetInfo | null;
  onClose: () => void;
}) {
  const mutations = usePresetMutations();
  return (
    <ConfirmDialog
      open={preset !== null}
      title="Delete preset?"
      confirmLabel="Delete"
      busy={mutations.remove.isPending}
      description={
        <>
          <strong>{preset?.name}</strong> disappears from the picker. Tasks already created from it
          are untouched.
        </>
      }
      onClose={onClose}
      onConfirm={() => preset && mutations.remove.mutate(preset.id, { onSuccess: () => onClose() })}
    />
  );
}

function PresetForm({
  preset,
  busy,
  error,
  onSubmit,
  onCancel,
  testIdPrefix,
}: {
  preset?: TaskPresetInfo;
  busy?: boolean;
  error?: unknown;
  onSubmit: (values: TaskPresetInput) => void;
  onCancel: () => void;
  testIdPrefix: string;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [months, setMonths] = useState(preset?.monthsInterval?.toString() ?? "");
  const [meter, setMeter] = useState(preset?.meterInterval?.toString() ?? "");

  const monthsNum = months === "" ? null : Number(months);
  const meterNum = meter === "" ? null : Number(meter);
  const badMonths = monthsNum !== null && (!Number.isInteger(monthsNum) || monthsNum < 1);
  const badMeter = meterNum !== null && !(meterNum > 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === "" || badMonths || badMeter || busy) return;
    onSubmit({
      name: name.trim(),
      monthsInterval: monthsNum,
      meterInterval: meterNum,
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit} data-testid={`${testIdPrefix}-preset-form`}>
      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-preset-name`}>Name</Label>
        <Input
          id={`${testIdPrefix}-preset-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Oil change"
          maxLength={200}
          autoFocus
          data-testid={`${testIdPrefix}-preset-name`}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-preset-months`}>Default months</Label>
          <Input
            id={`${testIdPrefix}-preset-months`}
            type="number"
            min={1}
            step={1}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            placeholder="12"
            className="w-32"
            data-testid={`${testIdPrefix}-preset-months`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${testIdPrefix}-preset-meter`}>Default meter units</Label>
          <Input
            id={`${testIdPrefix}-preset-meter`}
            type="number"
            min={0}
            step="any"
            value={meter}
            onChange={(e) => setMeter(e.target.value)}
            placeholder="5000"
            className="w-32"
            data-testid={`${testIdPrefix}-preset-meter`}
          />
        </div>
      </div>
      {badMonths && <p className="text-sm text-destructive">Months must be a whole number ≥ 1.</p>}
      {badMeter && <p className="text-sm text-destructive">Meter units must be above 0.</p>}
      <FormError error={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || name.trim() === "" || badMonths || badMeter}
          data-testid={`${testIdPrefix}-preset-submit`}
        >
          {busy ? "Saving…" : preset ? "Save preset" : "Add preset"}
        </Button>
      </div>
    </form>
  );
}
