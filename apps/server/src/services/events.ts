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
	meterMiles?: number | null;
	meterHours?: number | null;
	notes?: string | null;
	serviceProvider?: string | null;
	costCents?: number | null;
	partsUsed?: string | null;
}

export interface EventWriteResult {
	event: ReturnType<typeof toEventDto>;
	warning: string | null;
}

/** Per-unit warnings when a recorded service skipped a clock it tracks. */
function skippedClockWarning(
	dims: { miles: boolean; hours: boolean },
	meters: { miles: boolean; hours: boolean },
	note: string | null,
): string | null {
	const skipped: string[] = [];
	if (dims.miles && !meters.miles) skipped.push("miles");
	if (dims.hours && !meters.hours) skipped.push("hours");
	if (skipped.length === 0) return note;
	const message = `No ${skipped.join(" or ")} reading entered — the ${skipped.length > 1 ? "their" : "that"} schedule will not advance.`;
	return note ? `${note} ${message}` : message;
}

export function createEvent(
	db: AppDatabase,
	equipmentId: string,
	input: EventWriteInput,
): EventWriteResult {
	getEquipmentRow(db, equipmentId); // 404 when missing
	const taskId = input.taskId ?? null;
	let dims = { miles: false, hours: false };
	if (taskId) {
		const task = getTaskRow(db, taskId);
		if (task.equipmentId !== equipmentId) {
			throw badRequest("Task belongs to different equipment.");
		}
		dims = { miles: task.milesEnabled, hours: task.hoursEnabled };
		// Readings are deliberately optional: whichever clock you skip keeps
		// its old baseline (its next-due stays put) and the warning says so.
	}
	const performedOn = input.performedOn;
	if (!performedOn) throw badRequest("Service date is required.");
	const label = input.label ?? "Maintenance";

	const warning = chronologyWarning(
		db,
		equipmentId,
		taskId,
		performedOn,
		{ miles: input.meterMiles ?? null, hours: input.meterHours ?? null },
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
		meterMiles: input.meterMiles ?? null,
		meterHours: input.meterHours ?? null,
		notes: input.notes ?? null,
		serviceProvider: input.serviceProvider ?? null,
		costCents: input.costCents ?? null,
		partsUsed: input.partsUsed ?? null,
		createdAt: now,
		updatedAt: now,
	};
	db.insert(maintenanceEvents).values(row).run();
	return {
		event: toEventDto(row),
		warning: skippedClockWarning(
			dims,
			{ miles: row.meterMiles !== null, hours: row.meterHours !== null },
			warning,
		),
	};
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
		...(patch.meterMiles !== undefined && { meterMiles: patch.meterMiles }),
		...(patch.meterHours !== undefined && { meterHours: patch.meterHours }),
		...(patch.notes !== undefined && { notes: patch.notes }),
		...(patch.serviceProvider !== undefined && { serviceProvider: patch.serviceProvider }),
		...(patch.costCents !== undefined && { costCents: patch.costCents }),
		...(patch.partsUsed !== undefined && { partsUsed: patch.partsUsed }),
		updatedAt: nowIso(),
	};
	let dims = { miles: false, hours: false };
	if (merged.taskId) {
		const task = getTaskRow(db, merged.taskId);
		if (task.equipmentId !== merged.equipmentId) {
			throw badRequest("Task belongs to different equipment.");
		}
		dims = { miles: task.milesEnabled, hours: task.hoursEnabled };
	}
	const warning = chronologyWarning(
		db,
		merged.equipmentId,
		merged.taskId,
		merged.performedOn,
		{ miles: merged.meterMiles, hours: merged.meterHours },
		merged.id,
	);
	db.update(maintenanceEvents).set(merged).where(eq(maintenanceEvents.id, id)).run();
	const touchedMeters = patch.meterMiles !== undefined || patch.meterHours !== undefined;
	return {
		event: toEventDto(merged),
		warning: touchedMeters
			? skippedClockWarning(
					dims,
					{ miles: merged.meterMiles !== null, hours: merged.meterHours !== null },
					warning,
				)
			: warning,
	};
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

type UnitMeters = { miles: number | null; hours: number | null };

/**
 * Explain — but never block — meter chronology conflicts on either unit, so
 * legitimate dated backfills stay possible while an explicit correction path
 * remains available.
 */
function chronologyWarning(
	db: AppDatabase,
	equipmentId: string,
	taskId: string | null,
	performedOn: string,
	meters: UnitMeters,
	excludeEventId: string | null,
): string | null {
	if (!taskId) return null;
	const siblings = db
		.select()
		.from(maintenanceEvents)
		.where(eq(maintenanceEvents.taskId, taskId))
		.all()
		.filter((row) => row.id !== excludeEventId && row.equipmentId === equipmentId);
	for (const unit of ["miles", "hours"] as const) {
		const meter = meters[unit];
		if (meter === null) continue;
		for (const row of siblings) {
			const other = unit === "miles" ? row.meterMiles : row.meterHours;
			if (other === null) continue;
			if (row.performedOn > performedOn && other < meter) {
				return `This ${unit} reading (${formatMeter(meter)}) is higher than a later service on ${row.performedOn} (${formatMeter(other)}). Edit that earlier record if it was a data-entry error.`;
			}
			if (row.performedOn < performedOn && other > meter) {
				return `This ${unit} reading (${formatMeter(meter)}) is lower than a previous service on ${row.performedOn} (${formatMeter(other)}). Consider correcting the other record instead.`;
			}
		}
	}
	return null;
}
