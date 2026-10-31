import type { InterventionInfo } from "@maintenance-tracker/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError, api, type EquipmentRow } from "@/api/client";
import { PageError } from "@/components/empty-state";
import { InterventionForm, type InterventionFormValues } from "@/components/intervention-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useAttachments, useInterventionMutations, useInterventions } from "@/hooks/use-history";
import { useEquipmentTasks } from "@/hooks/use-tasks";
import { daysAgo, formatReading } from "@/lib/format";

/** The equipment History tab (§8) — demoted to a tab, exactly as planned. */
export function HistoryPane({ equipment }: { equipment: EquipmentRow }) {
  const interventions = useInterventions(equipment.id);
  const tasks = useEquipmentTasks(equipment.id);
  const attachments = useAttachments(equipment.id);
  const mutations = useInterventionMutations(equipment.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InterventionInfo | null>(null);
  const [deleting, setDeleting] = useState<InterventionInfo | null>(null);

  const unit =
    equipment.meterKind === "miles" ? "mi" : equipment.meterKind === "hours" ? "h" : null;
  const nameFor = (i: InterventionInfo) =>
    i.label ?? tasks.data?.find((t) => t.id === i.taskId)?.name ?? "Work";

  const rows = (interventions.data ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-3" data-testid="history-pane">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)} data-testid="record-work-button">
          <Plus /> Record work
        </Button>
      </div>

      {interventions.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {interventions.isError && <PageError message="Could not load history." />}
      {interventions.data?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet. Log the first service, repair or chore — the meter and every
            countdown follow the history from there.
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {rows.map((i) => (
          <HistoryRow
            key={i.id}
            equipment={equipment}
            intervention={i}
            title={nameFor(i)}
            unit={unit}
            photos={(attachments.data ?? []).filter((a) => a.interventionId === i.id)}
            onEdit={() => setEditing(i)}
            onDelete={() => setDeleting(i)}
          />
        ))}
      </ul>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Record work">
        {adding && (
          <CreateWork
            equipment={equipment}
            tasks={tasks.data ?? []}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit work">
        {editing !== null && (
          <EditWork
            equipment={equipment}
            tasks={tasks.data ?? []}
            intervention={editing}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this record?"
        confirmLabel="Delete"
        busy={mutations.remove.isPending}
        description={
          <>
            {deleting && nameFor(deleting)} on {deleting?.date} disappears. If this work set the
            meter or an expiry date, those roll back to what remains.
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && mutations.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </div>
  );
}

function CreateWork({
  equipment,
  tasks,
  onCancel,
}: {
  equipment: EquipmentRow;
  tasks: import("@maintenance-tracker/shared").TaskWithDue[];
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(values: InterventionFormValues) {
    setBusy(true);
    setError(null);
    try {
      const { photos, taskId: _taskId, label, ...rest } = values;
      void label; // create always carries one of taskId/label; keep both paths
      const created = await api.interventions.create(equipment.id, {
        ...rest,
        ...(values.taskId != null
          ? { taskId: values.taskId }
          : { label: (values.label ?? "").trim() }),
      });
      for (const file of photos) await api.interventions.addPhoto(created.id, file);
      await qc.invalidateQueries({ queryKey: ["equipment", equipment.id] });
      void qc.invalidateQueries({ queryKey: ["equipment"] });
      onCancel();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <InterventionForm
      equipment={equipment}
      tasks={tasks}
      busy={busy}
      error={error}
      onSubmit={(v) => void submit(v)}
      onCancel={onCancel}
      testIdPrefix="create"
    />
  );
}

function EditWork({
  equipment,
  tasks,
  intervention,
  onCancel,
}: {
  equipment: EquipmentRow;
  tasks: import("@maintenance-tracker/shared").TaskWithDue[];
  intervention: InterventionInfo;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(values: InterventionFormValues) {
    setBusy(true);
    setError(null);
    try {
      const { photos: _photos, taskId: _taskId, label: _label, ...patch } = values;
      await api.interventions.update(intervention.id, patch);
      await qc.invalidateQueries({ queryKey: ["equipment", equipment.id] });
      void qc.invalidateQueries({ queryKey: ["equipment"] });
      onCancel();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <InterventionForm
      equipment={equipment}
      tasks={tasks}
      intervention={intervention}
      busy={busy}
      error={error}
      onSubmit={(v) => void submit(v)}
      onCancel={onCancel}
      testIdPrefix="edit"
    />
  );
}

function HistoryRow({
  equipment,
  intervention: i,
  title,
  unit,
  photos,
  onEdit,
  onDelete,
}: {
  equipment: EquipmentRow;
  intervention: InterventionInfo;
  title: string;
  unit: "mi" | "h" | null;
  photos: { id: string; mimeType: string }[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function addPhoto(file: File) {
    setPhotoError(null);
    try {
      await api.interventions.addPhoto(i.id, file);
      await qc.invalidateQueries({ queryKey: ["equipment", equipment.id] });
    } catch (err) {
      setPhotoError(
        err instanceof ApiError && err.code === "unsupported_media"
          ? "Photos must be PNG, JPEG, GIF or WEBP."
          : "Could not upload the photo.",
      );
    }
  }

  const meta = [
    i.meterAt !== null
      ? formatReading(i.meterAt, equipment.meterKind === "miles" ? "miles" : "hours")
      : null,
    i.expiryDate !== null ? `expires ${i.expiryDate}` : null,
    i.performedBy,
    i.location,
  ].filter((s): s is string => s !== null && s !== "");

  return (
    <li>
      <Card data-testid={`history-row-${i.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">
                  {i.date} · {daysAgo(i.date)}
                </span>
                {unit !== null && i.meterAt === null && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    no meter reading
                  </span>
                )}
              </div>
              {meta.length > 0 && (
                <p className="mt-0.5 text-sm text-muted-foreground">{meta.join(" · ")}</p>
              )}
              {i.comments && <p className="mt-1 text-sm">{i.comments}</p>}
              {photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {photos.map((p) => (
                    <img
                      key={p.id}
                      src={api.attachments.url(p.id)}
                      alt=""
                      className="size-16 rounded-md border object-cover"
                      data-testid="photo-thumb"
                    />
                  ))}
                </div>
              )}
              {photoError && <p className="mt-1 text-sm text-destructive">{photoError}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                data-testid={`photo-input-${i.id}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void addPhoto(f);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Add photo"
                onClick={() => fileRef.current?.click()}
                data-testid={`add-photo-${i.id}`}
              >
                <Camera />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${title}`}
                onClick={onEdit}
                data-testid={`edit-work-${i.id}`}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${title}`}
                onClick={onDelete}
                data-testid={`delete-work-${i.id}`}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
