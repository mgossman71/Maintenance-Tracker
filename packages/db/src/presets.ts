import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "./index";
import { taskPresets } from "./schema";

/**
 * Built-in preset library — editable suggestions only. Changing or deleting a
 * preset never touches existing tasks, and presets are never presented as
 * manufacturer-approved schedules. Meter suggestions are integer tenths.
 */

export interface BuiltinPreset {
	name: string;
	description: string;
	suggestMeterInterval: number | null; // tenths
	suggestCalendarValue: number | null;
	suggestCalendarUnit: "days" | "weeks" | "months" | "years" | null;
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
	{
		name: "Oil & Filter Change",
		description: "Engine oil and filter (vehicles)",
		suggestMeterInterval: 50_000, // 5,000 mi
		suggestCalendarValue: 12,
		suggestCalendarUnit: "months",
	},
	{
		name: "Tire Rotation",
		description: "Rotate tires",
		suggestMeterInterval: 75_000,
		suggestCalendarValue: null,
		suggestCalendarUnit: null,
	},
	{
		name: "Engine Air Filter",
		description: "Replace engine air filter",
		suggestMeterInterval: 150_000,
		suggestCalendarValue: 12,
		suggestCalendarUnit: "months",
	},
	{
		name: "Cabin Air Filter",
		description: "Replace HVAC cabin filter",
		suggestMeterInterval: 200_000,
		suggestCalendarValue: 12,
		suggestCalendarUnit: "months",
	},
	{
		name: "Coolant Flush",
		description: "Engine coolant exchange",
		suggestMeterInterval: 300_000,
		suggestCalendarValue: 24,
		suggestCalendarUnit: "months",
	},
	{
		name: "Brake Fluid",
		description: "Brake fluid exchange",
		suggestMeterInterval: null,
		suggestCalendarValue: 24,
		suggestCalendarUnit: "months",
	},
	{
		name: "Spark Plugs",
		description: "Replace spark plugs",
		suggestMeterInterval: 600_000,
		suggestCalendarValue: null,
		suggestCalendarUnit: null,
	},
	{
		name: "Transmission Fluid",
		description: "Transmission fluid service",
		suggestMeterInterval: 600_000,
		suggestCalendarValue: 48,
		suggestCalendarUnit: "months",
	},
	{
		name: "Small Engine Oil Change",
		description: "Mowers, generators, blowers (operating hours)",
		suggestMeterInterval: 500, // 50 hours
		suggestCalendarValue: 12,
		suggestCalendarUnit: "months",
	},
	{
		name: "General Lubrication",
		description: "Grease fittings and pivots (operating hours)",
		suggestMeterInterval: 1_000, // 100 hours
		suggestCalendarValue: null,
		suggestCalendarUnit: null,
	},
	{
		name: "Fuel Stabilizer / Winter Storage",
		description: "Seasonal storage preparation",
		suggestMeterInterval: null,
		suggestCalendarValue: 12,
		suggestCalendarUnit: "months",
	},
	{
		name: "Fluids & Filters Walkaround",
		description: "Inspect top up all fluids, check filters",
		suggestMeterInterval: null,
		suggestCalendarValue: 30,
		suggestCalendarUnit: "days",
	},
];

/** Insert the builtin preset library when none exist yet. Idempotent. */
export function seedBuiltinPresets(db: AppDatabase): void {
	const count = db.get<{ c: number }>(sql`SELECT COUNT(*) AS c FROM task_presets`);
	if ((count?.c ?? 0) > 0) return;
	const now = new Date().toISOString();
	db.insert(taskPresets).values(
		BUILTIN_PRESETS.map((preset, index) => ({
			id: randomUUID(),
			name: preset.name,
			description: preset.description,
			suggestMeterInterval: preset.suggestMeterInterval,
			suggestCalendarValue: preset.suggestCalendarValue,
			suggestCalendarUnit: preset.suggestCalendarUnit,
			sortOrder: index,
			isBuiltin: true,
			hidden: false,
			createdAt: now,
			updatedAt: now,
		})),
	);
}
