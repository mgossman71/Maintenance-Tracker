import type { AppDatabase, MaintenanceTaskRow } from "@mt/db";
import { maintenanceEvents, maintenanceTasks } from "@mt/db";
import type { CalendarUnit, TaskDto } from "@mt/shared";
import { taskShapeRefine } from "@mt/shared";
import { eq } from "drizzle-orm";
import { notFound, nowIso, uuid, validation } from "../util";
import { getEquipmentRow } from "./equipment";
import { toTaskDto } from "./status";

export interface TaskWriteInput {
	name?: string;
	description?: string | null;
	presetId?: string | null;
	enabled?: boolean;
	milesEnabled?: boolean;
	milesInterval?: number | null;
	hoursEnabled?: boolean;
	hoursInterval?: number | null;
	calendarEnabled?: boolean;
	calendarValue?: number | null;
	calendarUnit?: CalendarUnit | null;
}

function validateEffective(
	task: MaintenanceTaskRow,
	meters: { hasMiles: boolean; hasHours: boolean },
): void {
	if (!task.enabled) return; // disabled tasks keep their shape untouched
	const message = taskShapeRefine(task, meters);
	if (message) throw validation(message);
}

export function createTask(
	db: AppDatabase,
	equipmentId: string,
	input: TaskWriteInput & {
		baselineDate?: string | null;
		baselineMiles?: number | null;
		baselineHours?: number | null;
	},
): TaskDto {
	const eqRow = getEquipmentRow(db, equipmentId);
	const now = nowIso();
	const row: MaintenanceTaskRow = {
		id: uuid(),
		equipmentId,
		name: input.name ?? "Untitled task",
		description: input.description ?? null,
		presetId: input.presetId ?? null,
		enabled: input.enabled ?? true,
		milesEnabled: input.milesEnabled ?? false,
		milesInterval: input.milesInterval ?? null,
		hoursEnabled: input.hoursEnabled ?? false,
		hoursInterval: input.hoursInterval ?? null,
		calendarEnabled: input.calendarEnabled ?? false,
		calendarValue: input.calendarValue ?? null,
		calendarUnit: input.calendarUnit ?? null,
		createdAt: now,
		updatedAt: now,
	};
	validateEffective(row, { hasMiles: eqRow.hasMiles, hasHours: eqRow.hasHours });
	// Baselines are optional at creation: a task without enough last-service
	// data simply reports NEEDS_BASELINE until history or a baseline is added.

	db.insert(maintenanceTasks).values(row).run();

	// Optional user-entered baseline becomes a source='baseline' event row —
	// the single baseline strategy (no baselines table).
	const hasBaseline =
		input.baselineDate || input.baselineMiles != null || input.baselineHours != null;
	if (hasBaseline) {
		if (!input.baselineDate && row.calendarEnabled) {
			throw validation(
				"A baseline date is required when a baseline reading is given and the time dimension is enabled.",
			);
		}
		const performedOn = input.baselineDate ?? todayish(now);
		db.insert(maintenanceEvents)
			.values({
				id: uuid(),
				equipmentId,
				taskId: row.id,
				label: `${row.name} (baseline)`,
				source: "baseline",
				performedOn,
				meterMiles: input.baselineMiles ?? null,
				meterHours: input.baselineHours ?? null,
				notes: "Initial baseline entered when the task was created.",
				createdAt: now,
				updatedAt: now,
			})
			.run();
	}
	return toTaskDto(row);
}

function todayish(iso: string): string {
	return iso.slice(0, 10);
}

export function getTaskRow(db: AppDatabase, id: string): MaintenanceTaskRow {
	const row = db.select().from(maintenanceTasks).where(eq(maintenanceTasks.id, id)).get();
	if (!row) throw notFound("Task");
	return row;
}

/**
 * PATCH semantics: merge with stored values, then re-validate the effective
 * row. Interval changes apply prospectively — history is never touched.
 */
export function updateTask(db: AppDatabase, id: string, patch: TaskWriteInput): TaskDto {
	const existing = getTaskRow(db, id);
	const eqRow = getEquipmentRow(db, existing.equipmentId);
	const merged: MaintenanceTaskRow = {
		...existing,
		...(patch.name !== undefined && { name: patch.name }),
		...(patch.description !== undefined && { description: patch.description }),
		...(patch.presetId !== undefined && { presetId: patch.presetId }),
		...(patch.enabled !== undefined && { enabled: patch.enabled }),
		...(patch.milesEnabled !== undefined && { milesEnabled: patch.milesEnabled }),
		...(patch.milesInterval !== undefined && { milesInterval: patch.milesInterval }),
		...(patch.hoursEnabled !== undefined && { hoursEnabled: patch.hoursEnabled }),
		...(patch.hoursInterval !== undefined && { hoursInterval: patch.hoursInterval }),
		...(patch.calendarEnabled !== undefined && { calendarEnabled: patch.calendarEnabled }),
		...(patch.calendarValue !== undefined && { calendarValue: patch.calendarValue }),
		...(patch.calendarUnit !== undefined && { calendarUnit: patch.calendarUnit }),
		updatedAt: nowIso(),
	};
	// Guard against wiping an enabled dimension's interval without disabling it.
	if (merged.enabled && merged.milesEnabled && patch.milesInterval === null) {
		throw validation("Set the miles interval or disable the miles dimension.");
	}
	if (merged.enabled && merged.hoursEnabled && patch.hoursInterval === null) {
		throw validation("Set the hours interval or disable the hours dimension.");
	}
	validateEffective(merged, { hasMiles: eqRow.hasMiles, hasHours: eqRow.hasHours });
	db.update(maintenanceTasks).set(merged).where(eq(maintenanceTasks.id, id)).run();
	return toTaskDto(merged);
}

export function deleteTask(db: AppDatabase, id: string): void {
	getTaskRow(db, id);
	// Cascade removes that task's service events (they belong to the task);
	// general equipment events with task_id=null are untouched.
	db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id)).run();
}
