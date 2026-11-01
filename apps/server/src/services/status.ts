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
		meterKind: row.meterKind,
		currentMeter: row.currentMeter,
		meterVerifiedAt: row.meterVerifiedAt,
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
		meterEnabled: row.meterEnabled,
		meterInterval: row.meterInterval,
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
		meter: row.meter,
		notes: row.notes,
		serviceProvider: row.serviceProvider,
		costCents: row.costCents,
		partsUsed: row.partsUsed,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Latest applicable event by performed date with the fixed tie-breaker:
 * highest meter value, then latest created timestamp, then lexicographically
 * greatest id. Never by insertion time alone.
 */
export function latestApplicableEvent(rows: MaintenanceEventRow[]): MaintenanceEventRow | null {
	let best: MaintenanceEventRow | null = null;
	for (const row of rows) {
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
	const am = a.meter ?? -1;
	const bm = b.meter ?? -1;
	if (am !== bm) return am < bm ? -1 : 1;
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

export function scheduleSummary(task: MaintenanceTaskRow): string {
	const parts: string[] = [];
	if (task.meterEnabled && task.meterInterval !== null) {
		parts.push(`every ${formatMeter(task.meterInterval)} miles/hours`);
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
	latestEvent: MaintenanceEventRow | null,
	settings: SettingsDto,
	today: string,
): TaskStatusDto {
	const result = evaluateTask({
		meterKind: equipment.meterKind,
		currentMeter: equipment.currentMeter,
		task: {
			meterEnabled: task.meterEnabled,
			meterInterval: task.meterInterval,
			calendarEnabled: task.calendarEnabled,
			calendarValue: task.calendarValue,
			calendarUnit: task.calendarUnit,
			lastServiceDate: latestEvent?.performedOn ?? null,
			lastServiceMeter: latestEvent?.meter ?? null,
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
		meter: {
			enabled: result.meter.enabled,
			state: result.meter.state,
			nextDueMeter: result.meter.nextDueMeter,
			remainingMeter: result.meter.remainingMeter,
			unknownReason: result.meter.unknownReason,
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
		lastServiceDate: latestEvent?.performedOn ?? null,
		lastServiceMeter: latestEvent?.meter ?? null,
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
		const latest = latestApplicableEvent(eventsByTask.get(task.id) ?? []);
		result.set(task.id, computeTaskStatus(task, eqRow, latest, settings, today));
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
