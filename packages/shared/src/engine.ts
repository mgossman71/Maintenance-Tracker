import { addCalendarInterval, daysBetween } from "./dates";
import type { CalendarUnit, DimensionState, TaskStatus } from "./types";

/**
 * Pure, deterministic due-status engine. Inputs use integer tenths for all
 * meter values (see decimal.ts). Unknowns are null and never become zero.
 *
 * A task may carry up to three independent dimensions — miles, hours,
 * calendar — and becomes due when the FIRST of them comes due.
 */

export const DEFAULT_WARN_MILES = 500; // miles
export const DEFAULT_WARN_HOURS = 10; // hours
export const DEFAULT_WARN_DAYS = 30; // days

export interface EngineTaskInput {
	milesEnabled: boolean;
	/** Miles interval in tenths. */
	milesInterval: number | null;
	hoursEnabled: boolean;
	/** Hours interval in tenths. */
	hoursInterval: number | null;
	calendarEnabled: boolean;
	calendarValue: number | null;
	calendarUnit: CalendarUnit | null;
	/** Latest applicable service/baseline values. */
	lastServiceDate: string | null;
	/** Latest service at which this meter dimension's reading was captured. */
	lastServiceMiles: number | null;
	lastServiceHours: number | null;
}

export interface EngineInput {
	/** Whether the equipment carries each meter; dimensions without a
	 *  matching meter surface as unknowns rather than silent zeros. */
	hasMiles: boolean;
	hasHours: boolean;
	/** Current confirmed readings in tenths. */
	currentMiles: number | null;
	currentHours: number | null;
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
	miles: MeterDimensionResult;
	hours: MeterDimensionResult;
	calendar: CalendarDimensionResult;
	/** Which dimension drives the headline urgency, most urgent wins. */
	driving: "miles" | "hours" | "calendar" | null;
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

interface MeterEval {
	enabled: boolean;
	interval: number | null;
	lastMeter: number | null;
	hasMeter: boolean;
	current: number | null;
	/** Warn threshold in whole units. */
	warn: number;
}

function evaluateMeter(eval_: MeterEval): MeterDimensionResult {
	if (!eval_.enabled) return DISABLED_METER;
	if (!eval_.hasMeter) {
		return { ...DISABLED_METER, enabled: true, unknownReason: "no_meter_on_equipment" };
	}
	if (eval_.interval === null || eval_.interval <= 0) {
		return { ...DISABLED_METER, enabled: true, unknownReason: "no_interval" };
	}
	if (eval_.lastMeter === null) {
		return { ...DISABLED_METER, enabled: true, unknownReason: "no_last_service" };
	}
	if (eval_.current === null) {
		// Threshold is still known and displayable; remaining is not.
		return {
			enabled: true,
			state: "UNKNOWN",
			nextDueMeter: eval_.lastMeter + eval_.interval,
			remainingMeter: null,
			unknownReason: "no_current_meter",
		};
	}
	const nextDueMeter = eval_.lastMeter + eval_.interval;
	const remainingMeter = nextDueMeter - eval_.current;
	return {
		enabled: true,
		state: stateFromRemaining(remainingMeter, eval_.warn * 10),
		nextDueMeter,
		remainingMeter,
		unknownReason: null,
	};
}

export function evaluateTask(input: EngineInput): EngineResult {
	const task = input.task;

	const miles = evaluateMeter({
		enabled: task.milesEnabled,
		interval: task.milesInterval,
		lastMeter: task.lastServiceMiles,
		hasMeter: input.hasMiles,
		current: input.currentMiles,
		warn: input.warnMiles,
	});

	const hours = evaluateMeter({
		enabled: task.hoursEnabled,
		interval: task.hoursInterval,
		lastMeter: task.lastServiceHours,
		hasMeter: input.hasHours,
		current: input.currentHours,
		warn: input.warnHours,
	});

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

	// --- Overall status precedence: whichever dimension comes first ---
	const enabledDims = [miles, hours, calendar].filter((d) => d.enabled);
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

	// Headline dimension: most urgent wins; ties resolved miles > hours >
	// calendar for stable rendering.
	const dimStates = [
		["miles", miles.state],
		["hours", hours.state],
		["calendar", calendar.state],
	] as const;
	const candidates = dimStates.filter(([, state]) => state !== "UNKNOWN");
	const driving: EngineResult["driving"] =
		candidates.length === 0
			? null
			: candidates.reduce((best, cur) =>
					STATE_RANK[cur[1]] > STATE_RANK[best[1]] ? cur : best,
				)[0];

	return {
		status,
		miles,
		hours,
		calendar,
		driving,
		explanation: explain(status, miles, hours, calendar),
	};
}

function explain(
	status: TaskStatus,
	miles: MeterDimensionResult,
	hours: MeterDimensionResult,
	calendar: CalendarDimensionResult,
): string {
	if (status !== "NEEDS_BASELINE") return "";
	const missing: string[] = [];
	if (miles.enabled && miles.unknownReason === "no_interval") missing.push("miles interval");
	if (miles.enabled && miles.unknownReason === "no_last_service")
		missing.push("last service miles");
	if (miles.enabled && miles.unknownReason === "no_current_meter") missing.push("current miles");
	if (miles.enabled && miles.unknownReason === "no_meter_on_equipment")
		missing.push("miles interval (equipment has no mile meter)");
	if (hours.enabled && hours.unknownReason === "no_interval") missing.push("hours interval");
	if (hours.enabled && hours.unknownReason === "no_last_service")
		missing.push("last service hours");
	if (hours.enabled && hours.unknownReason === "no_current_meter") missing.push("current hours");
	if (hours.enabled && hours.unknownReason === "no_meter_on_equipment")
		missing.push("hours interval (equipment has no hour meter)");
	if (calendar.enabled && calendar.unknownReason === "no_interval")
		missing.push("calendar interval");
	if (calendar.enabled && calendar.unknownReason === "no_last_service")
		missing.push("last service date");
	return missing.length > 0
		? `Missing: ${missing.join(", ")}.`
		: "No evaluable schedule dimension.";
}

export { STATE_RANK };
