import type {
	AttachmentDto,
	DashboardDto,
	DocumentDto,
	EquipmentDto,
	EventDto,
	FuelEconomyDto,
	PresetDto,
	SessionDto,
	SettingsDto,
	TaskDto,
	TaskStatusDto,
} from "@mt/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const keys = {
	session: ["session"] as const,
	dashboard: ["dashboard"] as const,
	equipment: (archived = false) => ["equipment", archived] as const,
	equipmentDetail: (id: string) => ["equipment", id] as const,
	tasks: (equipmentId: string) => ["tasks", equipmentId] as const,
	events: (equipmentId: string) => ["events", equipmentId] as const,
	presets: ["presets"] as const,
	settings: ["settings"] as const,
};

export function useSession() {
	return useQuery({
		queryKey: keys.session,
		queryFn: () => api.get<SessionDto>("/api/session"),
		staleTime: 30_000,
	});
}

export function useDashboard() {
	return useQuery({
		queryKey: keys.dashboard,
		queryFn: () => api.get<DashboardDto>("/api/dashboard"),
	});
}

export function useEquipment(archived = false) {
	return useQuery({
		queryKey: keys.equipment(archived),
		queryFn: () => api.get<EquipmentDto[]>(`/api/equipment${archived ? "?archived=true" : ""}`),
	});
}

export function useEquipmentDetail(id: string) {
	return useQuery({
		queryKey: keys.equipmentDetail(id),
		queryFn: () => api.get<EquipmentDto>(`/api/equipment/${id}`),
		enabled: Boolean(id),
	});
}

export interface TaskWithStatus {
	task: TaskDto;
	status: TaskStatusDto;
}

/** Minimal equipment shape dialogs need to present both meter units. */
export interface EquipmentLite {
	id: string;
	name: string;
	hasMiles: boolean;
	hasHours: boolean;
	currentMiles: number | null;
	currentHours: number | null;
}

export function useTasks(equipmentId: string) {
	return useQuery({
		queryKey: keys.tasks(equipmentId),
		queryFn: () => api.get<TaskWithStatus[]>(`/api/equipment/${equipmentId}/tasks`),
		enabled: Boolean(equipmentId),
	});
}

export function useEvents(equipmentId: string) {
	return useQuery({
		queryKey: keys.events(equipmentId),
		queryFn: () => api.get<EventDto[]>(`/api/equipment/${equipmentId}/events`),
		enabled: Boolean(equipmentId),
	});
}

export function usePresets() {
	return useQuery({ queryKey: keys.presets, queryFn: () => api.get<PresetDto[]>("/api/presets") });
}

export function useDocuments(equipmentId: string) {
	return useQuery({
		queryKey: ["documents", equipmentId],
		queryFn: () => api.get<DocumentDto[]>(`/api/equipment/${equipmentId}/documents`),
		enabled: Boolean(equipmentId),
	});
}

export function useFuel(equipmentId: string) {
	return useQuery({
		queryKey: ["fuel", equipmentId],
		queryFn: () => api.get<FuelEconomyDto>(`/api/equipment/${equipmentId}/fuel`),
		enabled: Boolean(equipmentId),
	});
}

export type { AttachmentDto, DocumentDto };

export function useSettings() {
	return useQuery({
		queryKey: keys.settings,
		queryFn: () => api.get<SettingsDto>("/api/settings"),
	});
}

/** Invalidate everything derived: due status depends on equipment, tasks, events. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries();
	qc.invalidateQueries({ queryKey: keys.session });
}

export function useWrite<TVariables, TData>(
	mutate: (variables: TVariables) => Promise<TData>,
	options?: { onDone?: (data: TData) => void },
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: mutate,
		onSuccess: (data) => {
			invalidateAll(qc);
			options?.onDone?.(data);
		},
	});
}
