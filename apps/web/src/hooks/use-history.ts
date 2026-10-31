import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InterventionCreateInput, type InterventionUpdateInput } from "@/api/client";

export function useInterventions(equipmentId: string) {
  return useQuery({
    queryKey: ["equipment", equipmentId, "interventions"],
    queryFn: () => api.interventions.forEquipment(equipmentId),
  });
}

/** Work changes everything: history, tasks (due), equipment (meter), attachments. */
export function useInterventionMutations(equipmentId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["equipment", equipmentId] });
    void qc.invalidateQueries({ queryKey: ["equipment"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({
      mutationFn: (input: InterventionCreateInput) => api.interventions.create(equipmentId, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: InterventionUpdateInput }) =>
        api.interventions.update(id, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.interventions.remove(id),
      onSuccess: refresh,
    }),
    addPhoto: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        api.interventions.addPhoto(id, file),
      onSuccess: refresh,
    }),
  };
}

export function useAttachments(equipmentId: string) {
  return useQuery({
    queryKey: ["equipment", equipmentId, "attachments"],
    queryFn: () => api.attachments.forEquipment(equipmentId),
  });
}

export function useAttachmentMutations(equipmentId: string) {
  const qc = useQueryClient();
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["equipment", equipmentId, "attachments"] });
  return {
    upload: useMutation({
      mutationFn: (file: File) => api.attachments.uploadDocument(equipmentId, file),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.attachments.remove(id),
      onSuccess: refresh,
    }),
  };
}
