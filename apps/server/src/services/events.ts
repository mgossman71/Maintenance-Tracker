import type { AppDatabase, MaintenanceEventRow } from "@mt/db";
import { maintenanceEvents } from "@mt/db";
import { formatMeter } from "@mt/shared";
import { eq } from "drizzle-orm";
import { badRequest, notFound, nowIso, uuid } from "../util";
import { getEquipmentRow } from "./equipment";
import { toEventDto } from "./status";
import { getTaskRow } from "./tasks";

export interface EventWriteInput {
	taskId?: string | null;
	label?: string;
	performedOn?: string;
	meter?: number | null;
	notes?: string | null;
	serviceProvider?: string | null;
	costCents?: number | null;
	partsUsed?: string | null;
}

export interface EventWriteResult {
	event: ReturnType<typeof toEventDto>;
	warning: string | null;
}

export function createEvent(
	db: AppDatabase,
	equipmentId: string,
	input: EventWriteInput,
): EventWriteResult {
	getEquipmentRow(db, equipmentId); // 404 when missing
	const taskId = input.taskId ?? null;
	if (taskId) {
		const task = getTaskRow(db, taskId);
		if (task.equipmentId !== equipmentId) {
			throw badRequest("Task belongs to different equipment.");
		}
		// Recording service for a meter-based task requires a meter reading so
		// the due threshold recalculates. Time-only tasks leave it optional.
		if (task.meterEnabled && (input.meter === null || input.meter === undefined)) {
			throw badRequest(
				`A meter reading is required to record "${task.name}" so its mileage/hours schedule can advance.`,
			);
		}
	}
	const performedOn = input.performedOn;
	if (!performedOn) throw badRequest("Service date is required.");
	const label = input.label ?? "Maintenance";

	const warning = chronologyWarning(
		db,
		equipmentId,
		taskId,
		performedOn,
		input.meter ?? null,
		null,
	);

	const now = nowIso();
	const row: MaintenanceEventRow = {
		id: uuid(),
		equipmentId,
		taskId,
		label,
		source: "service",
		performedOn,
		meter: input.meter ?? null,
		notes: input.notes ?? null,
		serviceProvider: input.serviceProvider ?? null,
		costCents: input.costCents ?? null,
		partsUsed: input.partsUsed ?? null,
		createdAt: now,
		updatedAt: now,
	};
	db.insert(maintenanceEvents).values(row).run();
	return { event: toEventDto(row), warning };
}

export function getEventRow(db: AppDatabase, id: string): MaintenanceEventRow {
	const row = db.select().from(maintenanceEvents).where(eq(maintenanceEvents.id, id)).get();
	if (!row) throw notFound("Service event");
	return row;
}

export function updateEvent(db: AppDatabase, id: string, patch: EventWriteInput): EventWriteResult {
	const existing = getEventRow(db, id);
	const merged: MaintenanceEventRow = {
		...existing,
		...(patch.taskId !== undefined && { taskId: patch.taskId }),
		...(patch.label !== undefined && { label: patch.label }),
		...(patch.performedOn !== undefined && { performedOn: patch.performedOn }),
		...(patch.meter !== undefined && { meter: patch.meter }),
		...(patch.notes !== undefined && { notes: patch.notes }),
		...(patch.serviceProvider !== undefined && { serviceProvider: patch.serviceProvider }),
		...(patch.costCents !== undefined && { costCents: patch.costCents }),
		...(patch.partsUsed !== undefined && { partsUsed: patch.partsUsed }),
		updatedAt: nowIso(),
	};
	if (merged.taskId) {
		const task = getTaskRow(db, merged.taskId);
		if (task.equipmentId !== merged.equipmentId) {
			throw badRequest("Task belongs to different equipment.");
		}
		if (task.meterEnabled && merged.meter === null) {
			throw badRequest("A meter reading is required for this task's schedule.");
		}
	}
	const warning = chronologyWarning(
		db,
		merged.equipmentId,
		merged.taskId,
		merged.performedOn,
		merged.meter,
		merged.id,
	);
	db.update(maintenanceEvents).set(merged).where(eq(maintenanceEvents.id, id)).run();
	return { event: toEventDto(merged), warning };
}

export function deleteEvent(db: AppDatabase, id: string): void {
	getEventRow(db, id);
	db.delete(maintenanceEvents).where(eq(maintenanceEvents.id, id)).run();
	// Status recalculates automatically from the remaining latest applicable
	// event (or the initial baseline) when next computed.
}

export function listEvents(db: AppDatabase, equipmentId: string, taskId?: string | null) {
	let rows = db
		.select()
		.from(maintenanceEvents)
		.where(eq(maintenanceEvents.equipmentId, equipmentId))
		.all();
	if (taskId !== undefined && taskId !== null) rows = rows.filter((row) => row.taskId === taskId);
	rows.sort((a, b) =>
		a.performedOn === b.performedOn ? 0 : a.performedOn < b.performedOn ? 1 : -1,
	);
	return rows;
}

/**
 * Explain — but never block — meter chronology conflicts, so legitimate dated
 * backfills stay possible while an explicit correction path remains available.
 */
function chronologyWarning(
	db: AppDatabase,
	equipmentId: string,
	taskId: string | null,
	performedOn: string,
	meter: number | null,
	excludeEventId: string | null,
): string | null {
	if (!taskId || meter === null) return null;
	const siblings = db
		.select()
		.from(maintenanceEvents)
		.where(eq(maintenanceEvents.taskId, taskId))
		.all()
		.filter(
			(row) => row.id !== excludeEventId && row.equipmentId === equipmentId && row.meter !== null,
		);
	for (const row of siblings) {
		if (row.performedOn > performedOn && (row.meter as number) < meter) {
			return `This reading (${formatMeter(meter)}) is higher than a later service on ${row.performedOn} (${formatMeter(row.meter as number)}). Edit that earlier record if it was a data-entry error.`;
		}
		if (row.performedOn < performedOn && (row.meter as number) > meter) {
			return `This reading (${formatMeter(meter)}) is lower than a previous service on ${row.performedOn} (${formatMeter(row.meter as number)}). Consider correcting the other record instead.`;
		}
	}
	return null;
}
