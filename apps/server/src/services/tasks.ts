import type { AppDatabase, MaintenanceTaskRow } from "@mt/db";
import { maintenanceEvents, maintenanceTasks } from "@mt/db";
import type { CalendarUnit } from "@mt/shared";
import { eq } from "drizzle-orm";
import { notFound, nowIso, uuid, validation } from "../util";
import { getEquipmentRow } from "./equipment";
import { toTaskDto } from "./status";

export interface TaskWriteInput {
	name?: string;
	description?: string | null;
	presetId?: string | null;
	enabled?: boolean;
	meterEnabled?: boolean;
	meterInterval?: number | null;
	calendarEnabled?: boolean;
	calendarValue?: number | null;
	calendarUnit?: CalendarUnit | null;
}

function validateEffective(task: MaintenanceTaskRow): void {
	if (!task.enabled) return; // disabled tasks keep their shape untouched
	if (!task.meterEnabled && !task.calendarEnabled) {
		throw validation("At least one schedule dimension (distance/hours or time) must be enabled.");
	}
	if (task.meterEnabled && (task.meterInterval === null || task.meterInterval <= 0)) {
		throw validation(
			"A positive mileage/hours interval is required when that dimension is enabled.",
		);
	}
	if (task.calendarEnabled && (task.calendarValue === null || !task.calendarUnit)) {
		throw validation(
			"A positive time interval and unit are required when that dimension is enabled.",
		);
	}
}

export function createTask(
	db: AppDatabase,
	equipmentId: string,
	input: TaskWriteInput & {
		meterEnabled: boolean;
		calendarEnabled: boolean;
		baselineDate?: string | null;
		baselineMeter?: number | null;
	},
) {
	const eqRow = getEquipmentRow(db, equipmentId);
	const now = nowIso();
	const row: MaintenanceTaskRow = {
		id: uuid(),
		equipmentId,
		name: input.name ?? "Untitled task",
		description: input.description ?? null,
		presetId: input.presetId ?? null,
		enabled: input.enabled ?? true,
		meterEnabled: input.meterEnabled,
		meterInterval: input.meterInterval ?? null,
		calendarEnabled: input.calendarEnabled,
		calendarValue: input.calendarValue ?? null,
		calendarUnit: input.calendarUnit ?? null,
		createdAt: now,
		updatedAt: now,
	};
	if (row.meterEnabled && eqRow.meterKind === "none") {
		throw validation("This equipment tracks no meter; enable the time dimension instead.");
	}
	validateEffective(row);
	// Baselines are optional at creation: a task without enough last-service
	// data simply reports NEEDS_BASELINE until history or a baseline is added.

	db.insert(maintenanceTasks).values(row).run();

	// Optional user-entered baseline becomes a source='baseline' event row —
	// the single baseline strategy (no baselines table).
	if (input.baselineDate || input.baselineMeter != null) {
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
				meter: input.baselineMeter ?? null,
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
export function updateTask(db: AppDatabase, id: string, patch: TaskWriteInput) {
	const existing = getTaskRow(db, id);
	const eqRow = getEquipmentRow(db, existing.equipmentId);
	const merged: MaintenanceTaskRow = {
		...existing,
		...(patch.name !== undefined && { name: patch.name }),
		...(patch.description !== undefined && { description: patch.description }),
		...(patch.presetId !== undefined && { presetId: patch.presetId }),
		...(patch.enabled !== undefined && { enabled: patch.enabled }),
		...(patch.meterEnabled !== undefined && { meterEnabled: patch.meterEnabled }),
		...(patch.meterInterval !== undefined && { meterInterval: patch.meterInterval }),
		...(patch.calendarEnabled !== undefined && { calendarEnabled: patch.calendarEnabled }),
		...(patch.calendarValue !== undefined && { calendarValue: patch.calendarValue }),
		...(patch.calendarUnit !== undefined && { calendarUnit: patch.calendarUnit }),
		updatedAt: nowIso(),
	};
	if (merged.meterEnabled && eqRow.meterKind === "none") {
		throw validation("This equipment tracks no meter; disable the meter dimension.");
	}
	// Guard against wiping an enabled dimension's interval without disabling it.
	if (merged.enabled && merged.meterEnabled && patch.meterInterval === null) {
		throw validation("Set the meter dimension interval or disable that dimension.");
	}
	validateEffective(merged);
	db.update(maintenanceTasks).set(merged).where(eq(maintenanceTasks.id, id)).run();
	return toTaskDto(merged);
}

export function deleteTask(db: AppDatabase, id: string): void {
	getTaskRow(db, id);
	// Cascade removes that task's service events (they belong to the task);
	// general equipment events with task_id=null are untouched.
	db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id)).run();
}
