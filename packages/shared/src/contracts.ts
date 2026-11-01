import { z } from "zod";
import { isCalendarDate } from "./dates";
import { CALENDAR_UNITS, METER_KINDS } from "./types";

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

export const equipmentMeterKind = z.enum(METER_KINDS);

const equipmentBase = {
	name: zTrimmed(120),
	category: zOptionalText(60),
	make: zOptionalText(60),
	model: zOptionalText(60),
	year: zYear,
	description: zOptionalText(),
};

export const equipmentCreateInput = z.object({
	...equipmentBase,
	meterKind: equipmentMeterKind,
	currentMeter: zTenthsNonNegative(),
});

export const equipmentUpdateInput = z.object({
	name: zTrimmed(120).optional(),
	category: zOptionalText(60),
	make: zOptionalText(60),
	model: zOptionalText(60),
	year: zYear,
	description: zOptionalText(),
	// meterKind may only change through the guarded conversion path (v1: only
	// allowed while no readings or meter-based tasks exist).
	meterKind: equipmentMeterKind.optional(),
	archived: z.boolean().optional(),
});

export const readingUpdateInput = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("increase"),
		value: zTenthsNonNegative().refine((v) => v !== null, "Reading value required"),
	}),
	z.object({
		mode: z.literal("confirm"),
	}),
	z.object({
		mode: z.literal("correction"),
		value: zTenthsNonNegative().refine((v) => v !== null, "Reading value required"),
	}),
]);

// --- Tasks -------------------------------------------------------------------

const taskBase = {
	name: zTrimmed(120),
	description: zOptionalText(),
	enabled: z.boolean().optional(),
	meterEnabled: z.boolean(),
	meterInterval: zTenthsPositive(),
	calendarEnabled: z.boolean(),
	calendarValue: z.coerce.number().int().min(1).max(10000).optional().nullable(),
	calendarUnit: z.enum(CALENDAR_UNITS).optional().nullable(),
};

function taskShapeRefine(shape: {
	meterEnabled: boolean;
	meterInterval?: number | null;
	calendarEnabled: boolean;
	calendarValue?: number | null;
	calendarUnit?: string | null;
}) {
	if (!shape.meterEnabled && !shape.calendarEnabled) {
		return "At least one schedule dimension (distance/hours or time) must be enabled.";
	}
	if (shape.meterEnabled && (shape.meterInterval == null || shape.meterInterval <= 0)) {
		return "A positive mileage/hours interval is required when that dimension is enabled.";
	}
	if (shape.calendarEnabled && (shape.calendarValue == null || !shape.calendarUnit)) {
		return "A positive time interval and unit are required when that dimension is enabled.";
	}
	return null;
}

export const taskCreateInput = z
	.object({
		...taskBase,
		presetId: z.string().uuid().optional().nullable(),
		// Optional initial baseline stored as a source='baseline' event.
		baselineDate: zCalendarDate.optional().nullable(),
		baselineMeter: zTenthsNonNegative(),
	})
	.superRefine((value, ctx) => {
		const message = taskShapeRefine(value);
		if (message) ctx.addIssue({ code: "custom", message, path: ["meterEnabled"] });
		// A baseline reading paired with an enabled time dimension needs its
		// date so the calendar threshold is not silently defaulted to today.
		if (value.baselineMeter != null && value.calendarEnabled && value.baselineDate == null) {
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
	meterEnabled: z.boolean().optional(),
	meterInterval: zTenthsPositive(),
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
	meter: zTenthsNonNegative(),
	notes: zOptionalText(),
	serviceProvider: zOptionalText(120),
	costCents: zCostCents,
	partsUsed: zOptionalText(),
});

export const eventUpdateInput = z.object({
	taskId: z.string().uuid().optional().nullable(),
	label: zTrimmed(120).optional(),
	performedOn: zCalendarDate.optional(),
	meter: zTenthsNonNegative(),
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
	meterKind: (typeof METER_KINDS)[number];
	currentMeter: number | null;
	meterVerifiedAt: string | null;
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
	meterEnabled: boolean;
	meterInterval: number | null;
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
	meter: number | null;
	notes: string | null;
	serviceProvider: string | null;
	costCents: number | null;
	partsUsed: string | null;
	createdAt: string;
	updatedAt: string;
	attachmentCount?: number;
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

/** Engine output as computed server-side for one task. */
export interface TaskStatusDto {
	taskId: string;
	equipmentId: string;
	status: string;
	disabled: boolean;
	meter: {
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
	lastServiceMeter: number | null;
	scheduleSummary: string;
}

export interface DashboardGroup {
	status: string;
	items: Array<
		TaskStatusDto & { equipmentName: string; meterKind: string; currentMeter: number | null }
	>;
}

export interface DashboardDto {
	groups: DashboardGroup[];
	staleReadingEquipment: Array<{ id: string; name: string; meterVerifiedAt: string | null }>;
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
	currentMeter: number;
	meterVerifiedAt: string;
	warning: string | null;
}
