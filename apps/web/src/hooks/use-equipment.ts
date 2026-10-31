import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EquipmentRow, type EquipmentUpdateInput } from "@/api/client";

/** Equipment list, cached app-wide (Dashboard + Equipment tab share it). */
export function useEquipment() {
  return useQuery({ queryKey: ["equipment"], queryFn: api.equipment.list });
}

export function useEquipmentById(id: string) {
  return useQuery({
    queryKey: ["equipment", id],
    queryFn: () => api.equipment.get(id),
  });
}

/** Any equipment mutation refreshes both the list and any detail view. */
export function useEquipmentMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["equipment"] });
  };
  return {
    create: useMutation({ mutationFn: api.equipment.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: EquipmentUpdateInput }) =>
        api.equipment.update(id, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: api.equipment.remove, onSuccess: refresh }),
    setReading: useMutation({
      mutationFn: ({
        id,
        reading,
        opts,
      }: {
        id: string;
        reading: number;
        opts?: { date?: string; correct?: boolean };
      }) => api.equipment.setReading(id, reading, opts),
      onSuccess: refresh,
    }),
  };
}

export function equipmentDisplayName(eq: EquipmentRow): string {
  return eq.icon !== "" ? `${eq.icon} ${eq.name}` : eq.name;
}
