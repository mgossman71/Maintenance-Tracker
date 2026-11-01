import { z } from "zod";
import { isCalendarDate } from "./dates";
import type { FuelSummary } from "./fuel";
import { CALENDAR_UNITS, METER_UNITS } from "./types";

/**
 * API contracts shared by server validation and the web client.
 * Meter fields arrive as string|number and are canonically parsed to
 * integer tenths here, at the boundary.
 */

export const PASSWORD_MIN_LENGTH = 10;

export const zCalendarDate = z
	.string()
	.trim()
	.refine(isCalendarDate, { message: "Enter a valid calendar date (YYYY-MM-DD)" });

/**
 * Meter values on the API wire are integer tenths of the unit (127.5 h -> 1275),
 * matching storage; clients convert human input with `parseMeterToTenths`.
 * Omitted keys stay absent (PATCH-safe); explicit null clears the value.
 */
function zTenths(positive: boolean) {
	return z
		.union([z.string(), z.number(), z.null()])
		.optional()
		.superRefine((value, ctx) => {
			if (value === null || value === undefined) return;
			const str = String(value).trim();
			if (!/^\d+$/.test(str)) {
				ctx.addIssue({ code: "custom", message: "Meter values must be whole numbers of tenths" });
				return;
			}
			if (positive && Number(str) <= 0) {
				ctx.addIssue({ code: "custom", message: "Must be greater than zero" });
			}
		})
		.transform((value) => {
			if (value === undefined) return undefined;
			if (value === null) return null;
			const tenths = Number(String(value).trim());
			return Number.isFinite(tenths) ? tenths : null;
		});
}

/** Integer tenths, > 0. */
const zTenthsPositive = () => zTenths(true);
/** Integer tenths, >= 0. */
const zTenthsNonNegative = () => zTenths(false);

const zTrimmed = (max = 200) => z.string().trim().min(1).max(max);
const zOptionalText = (max = 2000) => z.string().trim().max(max).optional().nullable();
const zYear = z.coerce.number().int().min(1800).max(2100).optional().nullable();
const zCostCents = z.coerce.number().int().min(0).max(100_000_000).optional().nullable();

// --- Auth -------------------------------------------------------------------

export const setupInput = z.object({
	password: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`),
});

export const loginInput = z.object({
	password: z.string().min(1, "Password required").max(512),
});

export const passwordChangeInput = z.object({
	currentPassword: z.string().min(1).max(512),
	newPassword: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`),
});

// --- Equipment ---------------------------------------------------------------

const equipmentBase = {
	name: zTrimmed(120),
	category: zOptionalText(60),
	make: zOptionalText(60),
	model: zOptionalText(60),
	year: zYear,
	description: zOptionalText(),
};

/** A machine may carry a mile meter, an hour meter, or both. */
const metersShape = {
	hasMiles: z.boolean().optional(),
	hasHours: z.boolean().optional(),
	currentMiles: zTenthsNonNegative(),
	currentHours: zTenthsNonNegative(),
};

function metersRefine(value: {
	hasMiles?: boolean;
	hasHours?: boolean;
	currentMiles?: number | null;
	currentHours?: number | null;
}): string | null {
	if (value.currentMiles != null && value.hasMiles === false)
		return "A current miles reading requires a mile meter.";
	if (value.currentHours != null && value.hasHours === false)
		return "A current hours reading requires an hour meter.";
	return null;
}

export const equipmentCreateInput = z
	.object({ ...equipmentBase, ...metersShape })
	.superRefine((value, ctx) => {
		const message = metersRefine(value);
		if (message) ctx.addIssue({ code: "custom", message, path: ["hasMiles"] });
	});

export const equipmentUpdateInput = z
	.object({
		name: zTrimmed(120).optional(),
		category: zOptionalText(60),
		make: zOptionalText(60),
		model: zOptionalText(60),
		year: zYear,
		description: zOptionalText(),
		...metersShape,
		archived: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		const message = metersRefine(value);
		if (message) ctx.addIssue({ code: "custom", message, path: ["hasMiles"] });
	});

export const readingUpdateInput = z.discriminatedUnion("mode", [
	z.object({
		/** Which meter this update applies to. */
		kind: z.enum(METER_UNITS),
		mode: z.literal("increase"),
		value: zTenthsNonNegative().refine((v) => v !== null, "Reading value required"),
	}),
	z.object({
		kind: z.enum(METER_UNITS),
		mode: z.literal("confirm"),
	}),
	z.object({
		kind: z.enum(METER_UNITS),
		mode: z.literal("correction"),
		value: zTenthsNonNegative().refine((v) => v !== null, "Reading value required"),
	}),
]);

// --- Tasks -------------------------------------------------------------------

const taskBase = {
	name: zTrimmed(120),
	description: zOptionalText(),
	enabled: z.boolean().optional(),
	milesEnabled: z.boolean().optional(),
	milesInterval: zTenthsPositive(),
	hoursEnabled: z.boolean().optional(),
	hoursInterval: zTenthsPositive(),
	calendarEnabled: z.boolean().optional(),
	calendarValue: z.coerce.number().int().min(1).max(10000).optional().nullable(),
	calendarUnit: z.enum(CALENDAR_UNITS).optional().nullable(),
};

interface TaskShapeLike {
	milesEnabled?: boolean;
	milesInterval?: number | null;
	hoursEnabled?: boolean;
	hoursInterval?: number | null;
	calendarEnabled?: boolean;
	calendarValue?: number | null;
	calendarUnit?: string | null;
}

/**
 * Effective-shape validation (merged with stored values on PATCH).
 * `meters` says whether the target equipment carries those meters;
 * enabling a dimension whose meter is absent is a server-side 422.
 */
export function taskShapeRefine(
	shape: TaskShapeLike,
	meters?: { hasMiles: boolean; hasHours: boolean },
): string | null {
	if (!shape.milesEnabled && !shape.hoursEnabled && !shape.calendarEnabled) {
		return "At least one schedule dimension (miles, hours, or time) must be enabled.";
	}
	if (shape.milesEnabled && (shape.milesInterval == null || shape.milesInterval <= 0)) {
		return "A positive miles interval is required when the miles dimension is enabled.";
	}
	if (shape.hoursEnabled && (shape.hoursInterval == null || shape.hoursInterval <= 0)) {
		return "A positive hours interval is required when the hours dimension is enabled.";
	}
	if (shape.calendarEnabled && (shape.calendarValue == null || !shape.calendarUnit)) {
		return "A positive time interval and unit are required when that dimension is enabled.";
	}
	if (meters) {
		if (shape.milesEnabled && !meters.hasMiles)
			return "This equipment has no mile meter; enable the miles meter first.";
		if (shape.hoursEnabled && !meters.hasHours)
			return "This equipment has no hour meter; enable the hour meter first.";
	}
	return null;
}

export const taskCreateInput = z
	.object({
		...taskBase,
		presetId: z.string().uuid().optional().nullable(),
		// Optional initial baseline stored as source='baseline' events.
		baselineDate: zCalendarDate.optional().nullable(),
		baselineMiles: zTenthsNonNegative(),
		baselineHours: zTenthsNonNegative(),
	})
	.superRefine((value, ctx) => {
		const message = taskShapeRefine(value);
		if (message) ctx.addIssue({ code: "custom", message, path: ["milesEnabled"] });
		if (
			(value.baselineMiles != null || value.baselineHours != null) &&
			value.calendarEnabled &&
			value.baselineDate == null
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"A baseline date is required when a baseline reading is given and the time dimension is enabled.",
				path: ["baselineDate"],
			});
		}
	});

export const taskUpdateInput = z.object({
	name: zTrimmed(120).optional(),
	description: zOptionalText(),
	enabled: z.boolean().optional(),
	milesEnabled: z.boolean().optional(),
	milesInterval: zTenthsPositive(),
	hoursEnabled: z.boolean().optional(),
	hoursInterval: zTenthsPositive(),
	calendarEnabled: z.boolean().optional(),
	calendarValue: z.coerce.number().int().min(1).max(10000).optional().nullable(),
	calendarUnit: z.enum(CALENDAR_UNITS).optional().nullable(),
	// PATCH: omitted keys keep stored values; the server merges and
	// re-validates the effective row (services/tasks.ts).
});

// --- Events -------------------------------------------------------------------

export const eventCreateInput = z.object({
	taskId: z.string().uuid().optional().nullable(),
	label: zTrimmed(120),
	performedOn: zCalendarDate,
	meterMiles: zTenthsNonNegative(),
	meterHours: zTenthsNonNegative(),
	notes: zOptionalText(),
	serviceProvider: zOptionalText(120),
	costCents: zCostCents,
	partsUsed: zOptionalText(),
});

export const eventUpdateInput = z.object({
	taskId: z.string().uuid().optional().nullable(),
	label: zTrimmed(120).optional(),
	performedOn: zCalendarDate.optional(),
	meterMiles: zTenthsNonNegative(),
	meterHours: zTenthsNonNegative(),
	notes: zOptionalText(),
	serviceProvider: zOptionalText(120),
	costCents: zCostCents,
	partsUsed: zOptionalText(),
});

// --- Presets -------------------------------------------------------------------

export const presetCreateInput = z.object({
	name: zTrimmed(120),
	description: zOptionalText(),
	suggestMeterInterval: zTenthsPositive(),
	suggestCalendarValue: z.coerce.number().int().min(1).max(10000).optional().nullable(),
	suggestCalendarUnit: z.enum(CALENDAR_UNITS).optional().nullable(),
});

export const presetUpdateInput = presetCreateInput.partial();

// --- Settings -------------------------------------------------------------------

export const settingsUpdateInput = z
	.object({
		warnMiles: z.coerce.number().int().min(1).max(100000).optional(),
		warnHours: z.coerce.number().int().min(1).max(100000).optional(),
		warnDays: z.coerce.number().int().min(1).max(3650).optional(),
		staleReadingDays: z.coerce.number().int().min(1).max(3650).optional(),
	})
	.refine((v) => Object.keys(v).length > 0, { message: "No settings provided" });

// --- Response shapes (shared with the web client) ------------------------------

export interface EquipmentDto {
	id: string;
	name: string;
	category: string | null;
	make: string | null;
	model: string | null;
	year: number | null;
	description: string | null;
	hasMiles: boolean;
	hasHours: boolean;
	currentMiles: number | null;
	currentHours: number | null;
	milesVerifiedAt: string | null;
	hoursVerifiedAt: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TaskDto {
	id: string;
	equipmentId: string;
	name: string;
	description: string | null;
	presetId: string | null;
	enabled: boolean;
	milesEnabled: boolean;
	milesInterval: number | null;
	hoursEnabled: boolean;
	hoursInterval: number | null;
	calendarEnabled: boolean;
	calendarValue: number | null;
	calendarUnit: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface EventDto {
	id: string;
	equipmentId: string;
	taskId: string | null;
	label: string;
	source: "service" | "baseline";
	performedOn: string;
	meterMiles: number | null;
	meterHours: number | null;
	notes: string | null;
	serviceProvider: string | null;
	costCents: number | null;
	partsUsed: string | null;
	createdAt: string;
	updatedAt: string;
	attachmentCount?: number;
	attachments?: AttachmentDto[];
}

export interface PresetDto {
	id: string;
	name: string;
	description: string | null;
	suggestMeterInterval: number | null;
	suggestCalendarValue: number | null;
	suggestCalendarUnit: string | null;
	sortOrder: number;
	isBuiltin: boolean;
	hidden: boolean;
}

export interface SettingsDto {
	warnMiles: number;
	warnHours: number;
	warnDays: number;
	staleReadingDays: number;
}

export interface DocumentDto {
	id: string;
	equipmentId: string;
	filename: string;
	mimeType: string;
	byteLength: number;
	createdAt: string;
}

export interface AttachmentDto {
	id: string;
	eventId: string;
	filename: string;
	mimeType: string;
	byteLength: number;
	createdAt: string;
}

/** Engine output as computed server-side for one task. */
export interface TaskStatusDto {
	taskId: string;
	equipmentId: string;
	status: string;
	disabled: boolean;
	miles: {
		enabled: boolean;
		state: string;
		nextDueMeter: number | null;
		remainingMeter: number | null;
		unknownReason: string | null;
	};
	hours: {
		enabled: boolean;
		state: string;
		nextDueMeter: number | null;
		remainingMeter: number | null;
		unknownReason: string | null;
	};
	calendar: {
		enabled: boolean;
		state: string;
		nextDueDate: string | null;
		remainingDays: number | null;
		unknownReason: string | null;
	};
	driving: string | null;
	explanation: string;
	lastServiceDate: string | null;
	lastServiceMiles: number | null;
	lastServiceHours: number | null;
	scheduleSummary: string;
}

export interface DashboardGroup {
	status: string;
	items: Array<
		TaskStatusDto & {
			taskName: string;
			equipmentName: string;
			hasMiles: boolean;
			hasHours: boolean;
			currentMiles: number | null;
			currentHours: number | null;
		}
	>;
}

export interface DashboardDto {
	groups: DashboardGroup[];
	staleReadingEquipment: Array<{
		id: string;
		name: string;
		staleUnits: (typeof METER_UNITS)[number][];
	}>;
	today: string;
}

export interface SessionDto {
	authenticated: boolean;
	setupComplete: boolean;
}

export interface ApiErrorBody {
	error: { code: string; message: string; fields?: Record<string, string> };
}

export interface ReadingUpdateResult {
	kind: "miles" | "hours";
	value: number;
	verifiedAt: string;
	warning: string | null;
}

// --- Fuel logs ---------------------------------------------------------------

/** Gallons arrive as string|number, canonically parsed to hundredths. */
const zGallons = z
	.union([z.string(), z.number()])
	.superRefine((value, ctx) => {
		if (/^\d+(\.\d{1,2})?$/.test(String(value).trim()) && Number.parseFloat(String(value)) > 0)
			return;
		ctx.addIssue({
			code: "custom",
			message: "Enter gallons as a positive number (max 2 decimals)",
		});
	})
	.transform((value) => {
		const n = Math.round(Number.parseFloat(String(value).trim()) * 100);
		return Number.isFinite(n) ? n : 0;
	});

const zPricePerGallonCents = z.coerce.number().int().min(1).max(100_000).optional().nullable();

const fuelLogBase = {
	loggedAt: zCalendarDate,
	odometer: zTenthsNonNegative(),
	gallons: zGallons,
	pricePerGallonCents: zPricePerGallonCents,
};

export const fuelLogCreateInput = z.object(fuelLogBase).superRefine((value, ctx) => {
	if (value.odometer == null) {
		ctx.addIssue({ code: "custom", message: "Odometer reading is required", path: ["odometer"] });
	}
});

export const fuelLogUpdateInput = z.object({
	loggedAt: zCalendarDate.optional(),
	// Odometer is NOT NULL, so an explicit null is rejected; omitted = unchanged.
	odometer: zTenthsNonNegative().refine((v) => v !== null, "Odometer reading is required"),
	gallons: zGallons.optional(),
	pricePerGallonCents: zPricePerGallonCents,
});

export interface FuelLogDto {
	id: string;
	equipmentId: string;
	loggedAt: string;
	odometer: number; // tenths of miles
	gallonsHundredths: number;
	pricePerGallonCents: number | null;
	totalCostCents: number | null;
	createdAt: string;
	updatedAt: string;
}

export interface FuelEconomyDto {
	entries: Array<FuelLogDto & { distanceTenths: number | null; mpgTenths: number | null }>;
	summary: FuelSummary;
}
