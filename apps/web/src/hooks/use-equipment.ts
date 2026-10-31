import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type EquipmentRow, type EquipmentUpdateInput } from "@/api/client";
import type { EquipmentFormValues } from "@/components/equipment-form";

/**
 * The edit-equipment dialog's save handler, shared by the list and detail
 * pages: patch the equipment, then sync the maintenance interval onto the
 * equipment's "Service" task (found by the shortcut signature, created if
 * the equipment somehow has none). Both writes finish before the dialog
 * closes, and any failure surfaces in the form rather than half-saving.
 */
export function useEquipmentSaver(eq: EquipmentRow, onSaved: () => void) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save(values: EquipmentFormValues) {
    setBusy(true);
    setError(null);
    try {
      const { serviceInterval, ...patch } = values;
      await api.equipment.update(eq.id, patch as EquipmentUpdateInput);
      if (serviceInterval != null) {
        const tasks = await api.equipment.tasks(eq.id);
        const svc = tasks.find((t) => t.name === "Service" && t.meterInterval !== null);
        if (svc !== undefined) {
          if (svc.meterInterval !== serviceInterval)
            await api.tasks.update(svc.id, { meterInterval: serviceInterval });
        } else {
          await api.equipment.createTask(eq.id, {
            name: "Service",
            kind: "interval",
            monthsInterval: 12,
            meterInterval: serviceInterval,
          });
        }
      }
      await qc.invalidateQueries({ queryKey: ["equipment"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return { save, busy, error };
}

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
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
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
