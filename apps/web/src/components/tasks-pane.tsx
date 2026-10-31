import type { TaskWithDue } from "@maintenance-tracker/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { EquipmentRow, TaskCreateInput } from "@/api/client";
import { DueChip, dueSummary } from "@/components/due";
import { PageError } from "@/components/empty-state";
import { TaskForm } from "@/components/task-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useEquipmentTasks, usePresets, useTaskMutations } from "@/hooks/use-tasks";

/** Short meter unit for due summaries; null for meterless equipment. */
function shortUnit(kind: EquipmentRow["meterKind"]): "mi" | "h" | null {
  return kind === "miles" ? "mi" : kind === "hours" ? "h" : null;
}

/** The equipment Tasks tab (§8): engine due status on every row. */
export function TasksPane({ equipment }: { equipment: EquipmentRow }) {
  const tasks = useEquipmentTasks(equipment.id);
  const presets = usePresets();
  const mutations = useTaskMutations(equipment.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TaskWithDue | null>(null);
  const [deleting, setDeleting] = useState<TaskWithDue | null>(null);

  const unit = shortUnit(equipment.meterKind);

  function create(values: TaskCreateInput) {
    mutations.create.mutate(values, { onSuccess: () => setAdding(false) });
  }

  function save(id: string, values: TaskCreateInput) {
    const { kind: _kind, ...patch } = values; // kind is fixed at creation
    mutations.update.mutate({ id, patch }, { onSuccess: () => setEditing(null) });
  }

  return (
    <div className="space-y-3" data-testid="tasks-pane">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)} data-testid="add-task-button">
          <Plus /> Add task
        </Button>
      </div>

      {tasks.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {tasks.isError && <PageError message="Could not load tasks." />}
      {tasks.data?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No tasks yet. Pick one from the task library — oil changes, impellers, filters — or
            create a custom task.
          </CardContent>
        </Card>
      )}

      {(tasks.data?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {tasks.data?.map((task) => (
            <li key={task.id}>
              <Card data-testid={`task-card-${task.id}`}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{task.name}</span>
                      <DueChip status={task.due.status} />
                    </div>
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid={`task-due-${task.id}`}
                    >
                      {dueSummary(task, unit) || "no due date yet"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${task.name}`}
                    onClick={() => setEditing(task)}
                    data-testid={`edit-task-${task.id}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${task.name}`}
                    onClick={() => setDeleting(task)}
                    data-testid={`delete-task-${task.id}`}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add task">
        {adding && (
          <TaskForm
            equipment={equipment}
            presets={presets.data ?? []}
            busy={mutations.create.isPending}
            error={mutations.create.error}
            onSubmit={create}
            onCancel={() => setAdding(false)}
            testIdPrefix="create"
          />
        )}
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit “${editing.name}”` : "Edit task"}
      >
        {editing !== null && (
          <TaskForm
            key={editing.id}
            equipment={equipment}
            task={editing}
            presets={presets.data ?? []}
            busy={mutations.update.isPending}
            error={mutations.update.error}
            onSubmit={(values) => save(editing.id, values)}
            onCancel={() => setEditing(null)}
            testIdPrefix="edit"
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete task?"
        confirmLabel="Delete"
        busy={mutations.remove.isPending}
        description={
          <>
            <strong>{deleting?.name}</strong> and its history on this equipment will be removed.
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
