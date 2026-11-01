import type { AppDatabase, EquipmentRow, MeterReadingRow } from "@mt/db";
import { equipment, fuelLogs, maintenanceEvents, maintenanceTasks, meterReadings } from "@mt/db";
import type { EquipmentDto, MeterUnit, ReadingUpdateResult } from "@mt/shared";
import { formatMeter } from "@mt/shared";
import { and, desc, eq } from "drizzle-orm";
import { badRequest, conflict, notFound, nowIso, uuid } from "../util";
import { toEquipmentDto } from "./status";

export function listEquipment(db: AppDatabase, includeArchived: boolean): EquipmentDto[] {
	const rows = db.select().from(equipment).orderBy(desc(equipment.createdAt)).all();
	return (includeArchived ? rows : rows.filter((row) => row.archivedAt === null)).map(
		toEquipmentDto,
	);
}

export function getEquipmentRow(db: AppDatabase, id: string): EquipmentRow {
	const row = db.select().from(equipment).where(eq(equipment.id, id)).get();
	if (!row) throw notFound("Equipment");
	return row;
}

export interface EquipmentWriteInput {
	name?: string;
	category?: string | null;
	make?: string | null;
	model?: string | null;
	year?: number | null;
	description?: string | null;
	hasMiles?: boolean;
	hasHours?: boolean;
	currentMiles?: number | null;
	currentHours?: number | null;
	archived?: boolean;
}

/** True when anything still references this unit's meter, so it cannot be removed. */
function unitInUse(db: AppDatabase, equipmentId: string, unit: MeterUnit): boolean {
	const readings = db
		.select({ id: meterReadings.id })
		.from(meterReadings)
		.where(and(eq(meterReadings.equipmentId, equipmentId), eq(meterReadings.kind, unit)))
		.all();
	if (readings.length > 0) return true;
	const events = db
		.select()
		.from(maintenanceEvents)
		.where(eq(maintenanceEvents.equipmentId, equipmentId))
		.all();
	if (events.some((e) => (unit === "miles" ? e.meterMiles : e.meterHours) !== null)) return true;
	const tasks = db
		.select()
		.from(maintenanceTasks)
		.where(eq(maintenanceTasks.equipmentId, equipmentId))
		.all();
	if (
		tasks.some((t) => {
			const enabled = unit === "miles" ? t.milesEnabled : t.hoursEnabled;
			const interval = unit === "miles" ? t.milesInterval : t.hoursInterval;
			return enabled || interval !== null;
		})
	)
		return true;
	if (unit === "miles") {
		const fuel = db
			.select({ id: fuelLogs.id })
			.from(fuelLogs)
			.where(eq(fuelLogs.equipmentId, equipmentId))
			.all();
		if (fuel.length > 0) return true;
	}
	return false;
}

function assertReadingsAllowed(hasMeter: boolean, unit: MeterUnit): void {
	if (!hasMeter) {
		throw badRequest(`This equipment has no ${unit === "miles" ? "mile" : "hour"} meter.`);
	}
}

export function createEquipment(db: AppDatabase, input: EquipmentWriteInput): EquipmentDto {
	const now = nowIso();
	const hasMiles = input.hasMiles ?? false;
	const hasHours = input.hasHours ?? false;
	if (input.currentMiles != null) assertReadingsAllowed(hasMiles, "miles");
	if (input.currentHours != null) assertReadingsAllowed(hasHours, "hours");
	const row: EquipmentRow = {
		id: uuid(),
		name: input.name as string,
		category: input.category ?? null,
		make: input.make ?? null,
		model: input.model ?? null,
		year: input.year ?? null,
		description: input.description ?? null,
		hasMiles,
		hasHours,
		currentMiles: input.currentMiles ?? null,
		currentHours: input.currentHours ?? null,
		milesVerifiedAt: input.currentMiles != null ? now : null,
		hoursVerifiedAt: input.currentHours != null ? now : null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	};
	db.insert(equipment).values(row).run();
	for (const unit of ["miles", "hours"] as const) {
		const value = unit === "miles" ? input.currentMiles : input.currentHours;
		if (value != null) {
			db.insert(meterReadings)
				.values({
					id: uuid(),
					equipmentId: row.id,
					kind: unit,
					value,
					mode: "increase",
					recordedAt: now,
				})
				.run();
		}
	}
	return toEquipmentDto(row);
}

export function updateEquipment(
	db: AppDatabase,
	id: string,
	patch: EquipmentWriteInput,
): EquipmentDto {
	const existing = getEquipmentRow(db, id);
	const now = nowIso();
	const set: Partial<EquipmentRow> = { updatedAt: now };
	for (const key of ["name", "category", "make", "model", "year", "description"] as const) {
		if (patch[key] !== undefined) (set as Record<string, unknown>)[key] = patch[key];
	}
	if (patch.archived !== undefined) set.archivedAt = patch.archived ? now : null;

	// --- Meter set changes -------------------------------------------------
	const nextHasMiles = patch.hasMiles ?? existing.hasMiles;
	const nextHasHours = patch.hasHours ?? existing.hasHours;

	// Removing a meter is only allowed while nothing references that unit;
	// adding one is always safe (its reading simply starts empty).
	if (!nextHasMiles && existing.hasMiles && unitInUse(db, id, "miles")) {
		throw conflict(
			"Cannot remove the mile meter while readings, services, tasks, or fuel logs use miles.",
		);
	}
	if (!nextHasHours && existing.hasHours && unitInUse(db, id, "hours")) {
		throw conflict(
			"Cannot remove the hour meter while readings, services, or hour-based tasks exist.",
		);
	}
	if (patch.hasMiles !== undefined) set.hasMiles = nextHasMiles;
	if (patch.hasHours !== undefined) set.hasHours = nextHasHours;
	if (!nextHasMiles && existing.hasMiles) {
		set.currentMiles = null;
		set.milesVerifiedAt = null;
	}
	if (!nextHasHours && existing.hasHours) {
		set.currentHours = null;
		set.hoursVerifiedAt = null;
	}

	// --- Current readings (also how a newly added meter gets its value) ----
	for (const unit of ["miles", "hours"] as const) {
		const incoming = unit === "miles" ? patch.currentMiles : patch.currentHours;
		if (incoming === undefined) continue;
		const has = unit === "miles" ? nextHasMiles : nextHasHours;
		if (incoming === null) {
			if (unit === "miles") {
				set.currentMiles = null;
				set.milesVerifiedAt = null;
			} else {
				set.currentHours = null;
				set.hoursVerifiedAt = null;
			}
			continue;
		}
		assertReadingsAllowed(has, unit);
		if (unit === "miles") {
			set.currentMiles = incoming;
			set.milesVerifiedAt = now;
		} else {
			set.currentHours = incoming;
			set.hoursVerifiedAt = now;
		}
		db.insert(meterReadings)
			.values({
				id: uuid(),
				equipmentId: id,
				kind: unit,
				value: incoming,
				mode: "increase",
				recordedAt: now,
			})
			.run();
	}

	db.update(equipment).set(set).where(eq(equipment.id, id)).run();
	return toEquipmentDto(getEquipmentRow(db, id));
}

export function deleteEquipment(db: AppDatabase, id: string): void {
	getEquipmentRow(db, id); // 404 when missing
	// FK cascade removes tasks, events, readings, fuel logs, and document rows.
	db.delete(equipment).where(eq(equipment.id, id)).run();
}

/**
 * Reading update with explicit meter unit and mode. Corrections are recorded
 * as their own history rows and never rewrite service event readings.
 */
export function applyReading(
	db: AppDatabase,
	id: string,
	kind: MeterUnit,
	mode: "increase" | "confirm" | "correction",
	value?: number | null,
): ReadingUpdateResult {
	const existing = getEquipmentRow(db, id);
	const hasMeter = kind === "miles" ? existing.hasMiles : existing.hasHours;
	if (!hasMeter) {
		throw badRequest(
			`This equipment has no ${kind === "miles" ? "mile" : "hour"} meter — enable it first.`,
		);
	}
	const current = kind === "miles" ? existing.currentMiles : existing.currentHours;
	let nextValue: number;
	let warning: string | null = null;

	if (mode === "confirm") {
		if (current === null) {
			throw badRequest("Nothing to confirm yet — enter the current reading first.");
		}
		nextValue = current;
	} else {
		if (value === null || value === undefined) throw badRequest("Reading value is required.");
		nextValue = value;
		if (mode === "increase" && current !== null && nextValue < current) {
			throw badRequest(
				`Reading ${formatMeter(nextValue)} is below the current ${formatMeter(current)}. Use Correct Reading to fix an error.`,
			);
		}
		if (mode === "correction" && current !== null && nextValue > current) {
			warning = "Correction raised the reading above the previous value.";
		}
		if (mode === "correction" && current !== null && nextValue < current) {
			warning =
				"Reading history below is preserved; service calculations use the corrected value going forward.";
		}
	}

	const now = nowIso();
	db.insert(meterReadings)
		.values({ id: uuid(), equipmentId: id, kind, value: nextValue, mode, recordedAt: now })
		.run();
	db.update(equipment)
		.set(
			kind === "miles"
				? { currentMiles: nextValue, milesVerifiedAt: now, updatedAt: now }
				: { currentHours: nextValue, hoursVerifiedAt: now, updatedAt: now },
		)
		.where(eq(equipment.id, id))
		.run();
	return { kind, value: nextValue, verifiedAt: now, warning };
}

export function listReadings(db: AppDatabase, equipmentId: string): MeterReadingRow[] {
	return db
		.select()
		.from(meterReadings)
		.where(eq(meterReadings.equipmentId, equipmentId))
		.orderBy(desc(meterReadings.recordedAt))
		.all();
}
