import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

/** The one hero round-trip: engine verdicts computed server-side (M7). */
export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
}

export function invalidateDashboard(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
}

/** Stale-meter banner actions live right on the banner. */
export function useDashboardMeterActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["equipment"] });
  };
  return {
    sameReading: useMutation({
      mutationFn: ({ id, reading }: { id: string; reading: number }) =>
        api.equipment.setReading(id, reading),
      onSuccess: refresh,
    }),
    updateReading: useMutation({
      mutationFn: ({ id, reading }: { id: string; reading: number }) =>
        api.equipment.setReading(id, reading),
      onSuccess: refresh,
    }),
  };
}
