import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type TaskCreateInput, type TaskUpdateInput } from "@/api/client";

export function useEquipmentTasks(equipmentId: string) {
  return useQuery({
    queryKey: ["equipment", equipmentId, "tasks"],
    queryFn: () => api.equipment.tasks(equipmentId),
  });
}

/** Task mutations invalidate the equipment's task list (due statuses ride along). */
export function useTaskMutations(equipmentId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["equipment", equipmentId, "tasks"] });
    void qc.invalidateQueries({ queryKey: ["equipment"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({
      mutationFn: (input: TaskCreateInput) => api.equipment.createTask(equipmentId, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: TaskUpdateInput }) =>
        api.tasks.update(id, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.tasks.remove(id),
      onSuccess: refresh,
    }),
  };
}

export function usePresets() {
  return useQuery({ queryKey: ["presets"], queryFn: api.presets.list });
}

export function usePresetMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["presets"] });
  return {
    create: useMutation({ mutationFn: api.presets.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: Parameters<typeof api.presets.update>[1];
      }) => api.presets.update(id, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: api.presets.remove, onSuccess: refresh }),
  };
}
