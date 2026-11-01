import type { AppDatabase, EquipmentRow, MeterReadingRow } from "@mt/db";
import { equipment, maintenanceTasks, meterReadings } from "@mt/db";
import type { EquipmentDto, ReadingUpdateResult } from "@mt/shared";
import { formatMeter } from "@mt/shared";
import { desc, eq } from "drizzle-orm";
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

export function createEquipment(
	db: AppDatabase,
	input: {
		name: string;
		category?: string | null;
		make?: string | null;
		model?: string | null;
		year?: number | null;
		description?: string | null;
		meterKind: "miles" | "hours" | "none";
		currentMeter?: number | null;
	},
): EquipmentDto {
	const now = nowIso();
	const row: EquipmentRow = {
		id: uuid(),
		name: input.name,
		category: input.category ?? null,
		make: input.make ?? null,
		model: input.model ?? null,
		year: input.year ?? null,
		description: input.description ?? null,
		meterKind: input.meterKind,
		currentMeter: input.currentMeter ?? null,
		meterVerifiedAt: input.currentMeter != null ? now : null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	};
	db.insert(equipment).values(row).run();
	if (input.currentMeter != null) {
		db.insert(meterReadings)
			.values({
				id: uuid(),
				equipmentId: row.id,
				value: input.currentMeter,
				mode: "increase",
				recordedAt: now,
			})
			.run();
	}
	return toEquipmentDto(row);
}

export function updateEquipment(
	db: AppDatabase,
	id: string,
	patch: Partial<{
		name: string;
		category: string | null;
		make: string | null;
		model: string | null;
		year: number | null;
		description: string | null;
		meterKind: "miles" | "hours" | "none";
		archived: boolean;
	}>,
): EquipmentDto {
	const existing = getEquipmentRow(db, id);

	// Meter kind is immutable once readings or meter-based tasks exist.
	if (patch.meterKind !== undefined && patch.meterKind !== existing.meterKind) {
		const hasReadings =
			db
				.select({ id: meterReadings.id })
				.from(meterReadings)
				.where(eq(meterReadings.equipmentId, id))
				.all().length > 0;
		const hasMeterTasks = db
			.select()
			.from(maintenanceTasks)
			.where(eq(maintenanceTasks.equipmentId, id))
			.all()
			.some((task) => task.meterEnabled || task.meterInterval !== null);
		if (hasReadings || hasMeterTasks) {
			throw conflict(
				"Meter kind cannot change while this equipment has readings or meter-based tasks. Correct individual readings or archive this item and create it fresh for a different meter type.",
			);
		}
	}

	const set: Partial<EquipmentRow> = { updatedAt: nowIso() };
	for (const key of ["name", "category", "make", "model", "year", "description"] as const) {
		if (patch[key] !== undefined) (set as Record<string, unknown>)[key] = patch[key];
	}
	if (patch.meterKind !== undefined) set.meterKind = patch.meterKind;
	if (patch.archived !== undefined) set.archivedAt = patch.archived ? nowIso() : null;
	db.update(equipment).set(set).where(eq(equipment.id, id)).run();
	return toEquipmentDto(getEquipmentRow(db, id));
}

export function deleteEquipment(db: AppDatabase, id: string): void {
	getEquipmentRow(db, id); // 404 when missing
	// FK cascade removes tasks, events, readings and document rows.
	db.delete(equipment).where(eq(equipment.id, id)).run();
}

/**
 * Reading update with explicit mode. Corrections are recorded as their own
 * history rows and never rewrite service event readings.
 */
export function applyReading(
	db: AppDatabase,
	id: string,
	mode: "increase" | "confirm" | "correction",
	value?: number | null,
): ReadingUpdateResult {
	const existing = getEquipmentRow(db, id);
	if (existing.meterKind === "none") {
		throw badRequest("This equipment tracks no meter; only calendar schedules apply.");
	}
	let nextValue: number;
	let warning: string | null = null;

	if (mode === "confirm") {
		if (existing.currentMeter === null) {
			throw badRequest("Nothing to confirm yet — enter the current reading first.");
		}
		nextValue = existing.currentMeter;
	} else {
		if (value === null || value === undefined) throw badRequest("Reading value is required.");
		nextValue = value;
		if (
			mode === "increase" &&
			existing.currentMeter !== null &&
			nextValue < existing.currentMeter
		) {
			throw badRequest(
				`Reading ${formatMeter(nextValue)} is below the current ${formatMeter(existing.currentMeter)}. Use Correct Reading to fix an error.`,
			);
		}
		if (
			mode === "correction" &&
			existing.currentMeter !== null &&
			nextValue > existing.currentMeter
		) {
			warning = "Correction raised the reading above the previous value.";
		}
		if (
			mode === "correction" &&
			existing.currentMeter !== null &&
			nextValue < existing.currentMeter
		) {
			warning =
				"Reading history below is preserved; service calculations use the corrected value going forward.";
		}
	}

	const now = nowIso();
	db.insert(meterReadings)
		.values({ id: uuid(), equipmentId: id, value: nextValue, mode, recordedAt: now })
		.run();
	db.update(equipment)
		.set({ currentMeter: nextValue, meterVerifiedAt: now, updatedAt: now })
		.where(eq(equipment.id, id))
		.run();
	return { currentMeter: nextValue, meterVerifiedAt: now, warning };
}

export function listReadings(db: AppDatabase, equipmentId: string): MeterReadingRow[] {
	return db
		.select()
		.from(meterReadings)
		.where(eq(meterReadings.equipmentId, equipmentId))
		.orderBy(desc(meterReadings.recordedAt))
		.all();
}
