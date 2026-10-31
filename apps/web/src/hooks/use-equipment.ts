import { useQuery } from "@tanstack/react-query";
import { api, type EquipmentRow } from "@/api/client";

/** Equipment list, cached app-wide (Dashboard + Equipment tab share it). */
export function useEquipment() {
  return useQuery({ queryKey: ["equipment"], queryFn: api.equipment.list });
}

export function equipmentDisplayName(eq: EquipmentRow): string {
  return eq.icon !== "" ? `${eq.icon} ${eq.name}` : eq.name;
}
