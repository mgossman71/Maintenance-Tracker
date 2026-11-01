import { addCalendarInterval, daysBetween } from "./dates";
import type { CalendarUnit, DimensionState, MeterKind, TaskStatus } from "./types";

/**
 * Pure, deterministic due-status engine. Inputs use integer tenths for all
 * meter values (see decimal.ts). Unknowns are null and never become zero.
 */

export const DEFAULT_WARN_MILES = 500; // miles
export const DEFAULT_WARN_HOURS = 10; // hours
export const DEFAULT_WARN_DAYS = 30; // days

export interface EngineTaskInput {
	meterEnabled: boolean;
	/** Meter interval in tenths. */
	meterInterval: number | null;
	calendarEnabled: boolean;
	calendarValue: number | null;
	calendarUnit: CalendarUnit | null;
	/** Latest applicable service/baseline values. */
	lastServiceDate: string | null;
	lastServiceMeter: number | null;
}

export interface EngineInput {
	meterKind: MeterKind;
	/** Current confirmed equipment reading in tenths. */
	currentMeter: number | null;
	task: EngineTaskInput;
	/** Today's local calendar date (YYYY-MM-DD). */
	today: string;
	warnMiles: number;
	warnHours: number;
	warnDays: number;
}

export type DimensionUnknownReason =
	| "disabled"
	| "no_interval"
	| "no_last_service"
	| "no_current_meter"
	| "no_meter_on_equipment";

export interface MeterDimensionResult {
	enabled: boolean;
	state: DimensionState;
	/** Next due meter threshold in tenths. */
	nextDueMeter: number | null;
	/** Signed remaining in tenths (negative = past due). */
	remainingMeter: number | null;
	unknownReason: DimensionUnknownReason | null;
}

export interface CalendarDimensionResult {
	enabled: boolean;
	state: DimensionState;
	nextDueDate: string | null;
	remainingDays: number | null;
	unknownReason: DimensionUnknownReason | null;
}

export interface EngineResult {
	status: TaskStatus;
	meter: MeterDimensionResult;
	calendar: CalendarDimensionResult;
	/** Which dimension drives the headline urgency, most urgent wins. */
	driving: "meter" | "calendar" | null;
	explanation: string;
}

const STATE_RANK: Record<DimensionState, number> = {
	OVERDUE: 3,
	DUE: 2,
	DUE_SOON: 1,
	OK: 0,
	UNKNOWN: -1,
};

/** Compare remaining against the warning threshold in the same unit. */
function stateFromRemaining(remaining: number, warnSameUnit: number): DimensionState {
	if (remaining < 0) return "OVERDUE";
	if (remaining === 0) return "DUE";
	if (remaining <= warnSameUnit) return "DUE_SOON";
	return "OK";
}

const DISABLED_METER: MeterDimensionResult = {
	enabled: false,
	state: "UNKNOWN",
	nextDueMeter: null,
	remainingMeter: null,
	unknownReason: "disabled",
};

const DISABLED_CALENDAR: CalendarDimensionResult = {
	enabled: false,
	state: "UNKNOWN",
	nextDueDate: null,
	remainingDays: null,
	unknownReason: "disabled",
};

export function evaluateTask(input: EngineInput): EngineResult {
	const task = input.task;

	// --- Meter dimension ---
	let meter: MeterDimensionResult;
	if (!task.meterEnabled) {
		meter = DISABLED_METER;
	} else if (input.meterKind === "none") {
		meter = { ...DISABLED_METER, enabled: true, unknownReason: "no_meter_on_equipment" };
	} else if (task.meterInterval === null || task.meterInterval <= 0) {
		meter = { ...DISABLED_METER, enabled: true, unknownReason: "no_interval" };
	} else if (task.lastServiceMeter === null) {
		meter = { ...DISABLED_METER, enabled: true, unknownReason: "no_last_service" };
	} else if (input.currentMeter === null) {
		// Threshold is still known and displayable; remaining is not.
		meter = {
			enabled: true,
			state: "UNKNOWN",
			nextDueMeter: task.lastServiceMeter + task.meterInterval,
			remainingMeter: null,
			unknownReason: "no_current_meter",
		};
	} else {
		const nextDueMeter = task.lastServiceMeter + task.meterInterval;
		const remainingMeter = nextDueMeter - input.currentMeter;
		const warnTenths = (input.meterKind === "miles" ? input.warnMiles : input.warnHours) * 10;
		meter = {
			enabled: true,
			state: stateFromRemaining(remainingMeter, warnTenths),
			nextDueMeter,
			remainingMeter,
			unknownReason: null,
		};
	}

	// --- Calendar dimension ---
	let calendar: CalendarDimensionResult;
	if (!task.calendarEnabled) {
		calendar = DISABLED_CALENDAR;
	} else if (task.calendarValue === null || !task.calendarUnit) {
		calendar = { ...DISABLED_CALENDAR, enabled: true, unknownReason: "no_interval" };
	} else if (task.lastServiceDate === null) {
		calendar = { ...DISABLED_CALENDAR, enabled: true, unknownReason: "no_last_service" };
	} else {
		const nextDueDate = addCalendarInterval(
			task.lastServiceDate,
			task.calendarValue,
			task.calendarUnit,
		);
		const remainingDays = nextDueDate === null ? null : daysBetween(input.today, nextDueDate);
		calendar =
			nextDueDate === null || remainingDays === null
				? { ...DISABLED_CALENDAR, enabled: true, unknownReason: "no_interval" }
				: {
						enabled: true,
						state: stateFromRemaining(remainingDays, input.warnDays),
						nextDueDate,
						remainingDays,
						unknownReason: null,
					};
	}

	// --- Overall status precedence ---
	const enabledDims = [meter, calendar].filter((d) => d.enabled);
	const evaluableStates = enabledDims
		.map((d) => d.state)
		.filter((s): s is Exclude<DimensionState, "UNKNOWN"> => s !== "UNKNOWN");
	const hasUnknownEnabled = enabledDims.some((d) => d.state === "UNKNOWN");

	let status: TaskStatus;
	if (evaluableStates.includes("OVERDUE")) status = "OVERDUE";
	else if (evaluableStates.includes("DUE")) status = "DUE";
	else if (evaluableStates.includes("DUE_SOON")) status = "DUE_SOON";
	else if (hasUnknownEnabled || evaluableStates.length === 0) status = "NEEDS_BASELINE";
	else status = "OK";

	let driving: "meter" | "calendar" | null = null;
	if (meter.state !== "UNKNOWN" && STATE_RANK[meter.state] >= STATE_RANK[calendar.state])
		driving = "meter";
	else if (calendar.state !== "UNKNOWN") driving = "calendar";

	return { status, meter, calendar, driving, explanation: explain(status, meter, calendar) };
}

function explain(
	status: TaskStatus,
	meter: MeterDimensionResult,
	calendar: CalendarDimensionResult,
): string {
	if (status !== "NEEDS_BASELINE") return "";
	const missing: string[] = [];
	if (meter.enabled && meter.unknownReason === "no_interval") missing.push("meter interval");
	if (meter.enabled && meter.unknownReason === "no_last_service")
		missing.push("last service meter");
	if (meter.enabled && meter.unknownReason === "no_current_meter") missing.push("current reading");
	if (meter.enabled && meter.unknownReason === "no_meter_on_equipment")
		missing.push("meter interval (equipment has no meter)");
	if (calendar.enabled && calendar.unknownReason === "no_interval")
		missing.push("calendar interval");
	if (calendar.enabled && calendar.unknownReason === "no_last_service")
		missing.push("last service date");
	return missing.length > 0
		? `Missing: ${missing.join(", ")}.`
		: "No evaluable schedule dimension.";
}

export { STATE_RANK };
