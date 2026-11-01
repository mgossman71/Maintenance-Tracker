import type { AppDatabase, FuelLogRow } from "@mt/db";
import { fuelLogs } from "@mt/db";
import type { FuelEconomyDto, FuelLogDto } from "@mt/shared";
import { computeFuelEconomy } from "@mt/shared";
import { asc, desc, eq } from "drizzle-orm";
import { badRequest, notFound, nowIso, uuid } from "../util";
import { getEquipmentRow } from "./equipment";

/** Fuel economy (MPG) is only meaningful for mile-based equipment. */
function requireMilesEquipment(db: AppDatabase, equipmentId: string) {
	const row = getEquipmentRow(db, equipmentId);
	if (row.meterKind !== "miles") {
		throw badRequest("Fuel tracking is available for mile-based equipment only.");
	}
	return row;
}

export function getFuelRow(db: AppDatabase, id: string): FuelLogRow {
	const row = db.select().from(fuelLogs).where(eq(fuelLogs.id, id)).get();
	if (!row) throw notFound("Fuel log");
	return row;
}

function toDto(row: FuelLogRow): FuelLogDto {
	const totalCostCents =
		row.pricePerGallonCents !== null && row.pricePerGallonCents > 0
			? Math.round((row.gallonsHundredths * row.pricePerGallonCents) / 100)
			: null;
	return {
		id: row.id,
		equipmentId: row.equipmentId,
		loggedAt: row.loggedAt,
		odometer: row.odometer,
		gallonsHundredths: row.gallonsHundredths,
		pricePerGallonCents: row.pricePerGallonCents,
		totalCostCents,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Fuel economy for one equipment item: fill-ups ordered by odometer with
 * per-interval MPG plus a whole-log summary (engine lives in @mt/shared).
 */
export function getFuelEconomy(db: AppDatabase, equipmentId: string): FuelEconomyDto {
	requireMilesEquipment(db, equipmentId);
	const rows = db
		.select()
		.from(fuelLogs)
		.where(eq(fuelLogs.equipmentId, equipmentId))
		.orderBy(asc(fuelLogs.odometer))
		.all();
	const { entries, summary } = computeFuelEconomy(
		rows.map((row) => ({
			id: row.id,
			loggedAt: row.loggedAt,
			odometerTenths: row.odometer,
			gallonsHundredths: row.gallonsHundredths,
			pricePerGallonCents: row.pricePerGallonCents,
		})),
	);
	const byId = new Map(rows.map((row) => [row.id, row]));
	return {
		entries: entries.map((e) => ({
			...toDto(byId.get(e.id) as FuelLogRow),
			distanceTenths: e.distanceTenths,
			mpgTenths: e.mpgTenths,
		})),
		summary,
	};
}

export interface FuelWriteInput {
	loggedAt: string;
	odometer: number;
	gallons: number; // hundredths
	pricePerGallonCents?: number | null;
}

/** PATCH shape: keys absent = unchanged; odometer null is rejected upstream. */
export interface FuelPatchInput {
	loggedAt?: string;
	odometer?: number | null;
	gallons?: number;
	pricePerGallonCents?: number | null;
}

/**
 * Guard against fat-fingered odometers: reject readings wildly above the
 * equipment's known current meter (fill-ups are often backdated, so lower
 * values are always fine).
 */
function assertSaneOdometer(db: AppDatabase, equipmentId: string, odometer: number): void {
	const equipment = getEquipmentRow(db, equipmentId);
	// 100,000 miles, in tenths: nothing on a farm or in a garage plausibly
	// drives that past its recorded reading in one fill-up.
	if (equipment.currentMeter === null && odometer > 1_000_000_0) {
		throw badRequest("That odometer looks implausibly high; set the current reading first.");
	}
	if (
		equipment.currentMeter !== null &&
		odometer > equipment.currentMeter + 100_000_0 // 100k miles ahead
	) {
		throw badRequest(
			"That odometer is far above the equipment's current reading. Update the reading first.",
		);
	}
}

export function createFuelLog(
	db: AppDatabase,
	equipmentId: string,
	input: FuelWriteInput,
): FuelLogDto {
	requireMilesEquipment(db, equipmentId);
	assertSaneOdometer(db, equipmentId, input.odometer);
	const now = nowIso();
	const row: FuelLogRow = {
		id: uuid(),
		equipmentId,
		loggedAt: input.loggedAt,
		odometer: input.odometer,
		gallonsHundredths: input.gallons,
		pricePerGallonCents: input.pricePerGallonCents ?? null,
		createdAt: now,
		updatedAt: now,
	};
	db.insert(fuelLogs).values(row).run();
	return toDto(row);
}

export function updateFuelLog(db: AppDatabase, id: string, patch: FuelPatchInput): FuelLogDto {
	const existing = getFuelRow(db, id);
	if (typeof patch.odometer === "number") {
		assertSaneOdometer(db, existing.equipmentId, patch.odometer);
	}
	const set: Partial<FuelLogRow> = { updatedAt: nowIso() };
	if (patch.loggedAt !== undefined) set.loggedAt = patch.loggedAt;
	// Contract rejects null odometers; typeof check narrows and defends.
	if (typeof patch.odometer === "number") set.odometer = patch.odometer;
	if (patch.gallons !== undefined) set.gallonsHundredths = patch.gallons;
	if (patch.pricePerGallonCents !== undefined) {
		set.pricePerGallonCents = patch.pricePerGallonCents;
	}
	db.update(fuelLogs).set(set).where(eq(fuelLogs.id, id)).run();
	return toDto({ ...existing, ...set });
}

export function deleteFuelLog(db: AppDatabase, id: string): void {
	getFuelRow(db, id);
	db.delete(fuelLogs).where(eq(fuelLogs.id, id)).run();
}

/** Newest first; used after writes so the client can refetch via GET. */
export function listFuelLogs(db: AppDatabase, equipmentId: string): FuelLogDto[] {
	requireMilesEquipment(db, equipmentId);
	return db
		.select()
		.from(fuelLogs)
		.where(eq(fuelLogs.equipmentId, equipmentId))
		.orderBy(desc(fuelLogs.loggedAt))
		.all()
		.map(toDto);
}
