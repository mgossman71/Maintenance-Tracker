import type { AppDatabase, EquipmentRow, MaintenanceEventRow, MaintenanceTaskRow } from "@mt/db";
import { equipment, maintenanceEvents } from "@mt/db";
import type {
	EquipmentDto,
	EventDto,
	SettingsDto,
	TaskDto,
	TaskStatus,
	TaskStatusDto,
} from "@mt/shared";
import { evaluateTask, formatMeter } from "@mt/shared";
import { inArray } from "drizzle-orm";

export function toEquipmentDto(row: EquipmentRow): EquipmentDto {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		make: row.make,
		model: row.model,
		year: row.year,
		description: row.description,
		hasMiles: row.hasMiles,
		hasHours: row.hasHours,
		currentMiles: row.currentMiles,
		currentHours: row.currentHours,
		milesVerifiedAt: row.milesVerifiedAt,
		hoursVerifiedAt: row.hoursVerifiedAt,
		archivedAt: row.archivedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toTaskDto(row: MaintenanceTaskRow): TaskDto {
	return {
		id: row.id,
		equipmentId: row.equipmentId,
		name: row.name,
		description: row.description,
		presetId: row.presetId,
		enabled: row.enabled,
		milesEnabled: row.milesEnabled,
		milesInterval: row.milesInterval,
		hoursEnabled: row.hoursEnabled,
		hoursInterval: row.hoursInterval,
		calendarEnabled: row.calendarEnabled,
		calendarValue: row.calendarValue,
		calendarUnit: row.calendarUnit,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toEventDto(row: MaintenanceEventRow): EventDto {
	return {
		id: row.id,
		equipmentId: row.equipmentId,
		taskId: row.taskId,
		label: row.label,
		source: row.source,
		performedOn: row.performedOn,
		meterMiles: row.meterMiles,
		meterHours: row.meterHours,
		notes: row.notes,
		serviceProvider: row.serviceProvider,
		costCents: row.costCents,
		partsUsed: row.partsUsed,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Latest applicable event by performed date; tie-breakers: latest created
 * timestamp, then lexicographically greatest id. Never by insertion time
 * alone. `pick` restricts the search to events that captured a specific
 * dimension's reading (readings are optional per dimension on purpose).
 */
export function latestApplicableEvent(
	rows: MaintenanceEventRow[],
	pick?: (row: MaintenanceEventRow) => number | null,
): MaintenanceEventRow | null {
	let best: MaintenanceEventRow | null = null;
	for (const row of rows) {
		if (pick && pick(row) === null) continue;
		if (!best) {
			best = row;
			continue;
		}
		best = compareEvents(row, best) > 0 ? row : best;
	}
	return best;
}

/** > 0 when a is later than b under the ordering rules. */
function compareEvents(a: MaintenanceEventRow, b: MaintenanceEventRow): number {
	if (a.performedOn !== b.performedOn) return a.performedOn < b.performedOn ? -1 : 1;
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

export function scheduleSummary(task: MaintenanceTaskRow): string {
	const parts: string[] = [];
	if (task.milesEnabled && task.milesInterval !== null) {
		parts.push(`every ${formatMeter(task.milesInterval)} miles`);
	}
	if (task.hoursEnabled && task.hoursInterval !== null) {
		parts.push(`every ${formatMeter(task.hoursInterval)} hours`);
	}
	if (task.calendarEnabled && task.calendarValue !== null && task.calendarUnit) {
		const unitLabel = task.calendarValue === 1 ? singular(task.calendarUnit) : task.calendarUnit;
		parts.push(`every ${task.calendarValue} ${unitLabel}`);
	}
	return parts.join(" or ") || "no schedule";
}

function singular(unit: string): string {
	return unit.endsWith("s") ? unit.slice(0, -1) : unit;
}

export function computeTaskStatus(
	task: MaintenanceTaskRow,
	equipment: EquipmentRow,
	taskEvents: MaintenanceEventRow[],
	settings: SettingsDto,
	today: string,
): TaskStatusDto {
	// Each dimension resets from the latest service that captured ITS reading;
	// a service that skipped the hour reading leaves the hour clock untouched.
	const latestAny = latestApplicableEvent(taskEvents);
	const latestMiles = latestApplicableEvent(taskEvents, (e) => e.meterMiles);
	const latestHours = latestApplicableEvent(taskEvents, (e) => e.meterHours);
	const result = evaluateTask({
		hasMiles: equipment.hasMiles,
		hasHours: equipment.hasHours,
		currentMiles: equipment.currentMiles,
		currentHours: equipment.currentHours,
		task: {
			milesEnabled: task.milesEnabled,
			milesInterval: task.milesInterval,
			hoursEnabled: task.hoursEnabled,
			hoursInterval: task.hoursInterval,
			calendarEnabled: task.calendarEnabled,
			calendarValue: task.calendarValue,
			calendarUnit: task.calendarUnit,
			lastServiceDate: latestAny?.performedOn ?? null,
			lastServiceMiles: latestMiles?.meterMiles ?? null,
			lastServiceHours: latestHours?.meterHours ?? null,
		},
		today,
		warnMiles: settings.warnMiles,
		warnHours: settings.warnHours,
		warnDays: settings.warnDays,
	});
	return {
		taskId: task.id,
		equipmentId: task.equipmentId,
		status: task.enabled ? result.status : "DISABLED",
		disabled: !task.enabled,
		miles: {
			enabled: result.miles.enabled,
			state: result.miles.state,
			nextDueMeter: result.miles.nextDueMeter,
			remainingMeter: result.miles.remainingMeter,
			unknownReason: result.miles.unknownReason,
		},
		hours: {
			enabled: result.hours.enabled,
			state: result.hours.state,
			nextDueMeter: result.hours.nextDueMeter,
			remainingMeter: result.hours.remainingMeter,
			unknownReason: result.hours.unknownReason,
		},
		calendar: {
			enabled: result.calendar.enabled,
			state: result.calendar.state,
			nextDueDate: result.calendar.nextDueDate,
			remainingDays: result.calendar.remainingDays,
			unknownReason: result.calendar.unknownReason,
		},
		driving: result.driving,
		explanation: result.explanation,
		lastServiceDate: latestAny?.performedOn ?? null,
		lastServiceMiles: latestMiles?.meterMiles ?? null,
		lastServiceHours: latestHours?.meterHours ?? null,
		scheduleSummary: scheduleSummary(task),
	};
}

/** Batch compute statuses: three queries total regardless of task count. */
export function computeAllStatuses(
	db: AppDatabase,
	tasks: MaintenanceTaskRow[],
	settings: SettingsDto,
	today: string,
): Map<string, TaskStatusDto> {
	const result = new Map<string, TaskStatusDto>();
	if (tasks.length === 0) return result;

	const taskIds = tasks.map((t) => t.id);
	const equipmentIds = [...new Set(tasks.map((t) => t.equipmentId))];

	const equipmentRows = db
		.select()
		.from(equipment)
		.where(inArray(equipment.id, equipmentIds))
		.all();
	const equipmentById = new Map(equipmentRows.map((row) => [row.id, row]));

	const eventRows = db
		.select()
		.from(maintenanceEvents)
		.where(inArray(maintenanceEvents.taskId, taskIds))
		.all();
	const eventsByTask = new Map<string, MaintenanceEventRow[]>();
	for (const row of eventRows) {
		if (!row.taskId) continue;
		const list = eventsByTask.get(row.taskId);
		if (list) list.push(row);
		else eventsByTask.set(row.taskId, [row]);
	}

	for (const task of tasks) {
		const eqRow = equipmentById.get(task.equipmentId);
		if (!eqRow) continue;
		result.set(
			task.id,
			computeTaskStatus(task, eqRow, eventsByTask.get(task.id) ?? [], settings, today),
		);
	}
	return result;
}

export const STATUS_ORDER: Array<TaskStatus | "DISABLED"> = [
	"OVERDUE",
	"DUE",
	"DUE_SOON",
	"NEEDS_BASELINE",
	"OK",
];
