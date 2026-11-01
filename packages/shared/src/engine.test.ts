import { describe, expect, test } from "bun:test";
import {
	DEFAULT_WARN_DAYS,
	DEFAULT_WARN_HOURS,
	DEFAULT_WARN_MILES,
	type EngineInput,
	evaluateTask,
} from "./engine";

const T = (units: number) => Math.round(units * 10);

/** Base input: both-meter equipment at 12,000 mi / 340 h, nothing enabled. */
function base(overrides: Partial<EngineInput> = {}): EngineInput {
	return {
		hasMiles: true,
		hasHours: true,
		currentMiles: T(12000),
		currentHours: T(340),
		task: {
			milesEnabled: false,
			milesInterval: null,
			hoursEnabled: false,
			hoursInterval: null,
			calendarEnabled: false,
			calendarValue: null,
			calendarUnit: null,
			lastServiceDate: "2026-01-01",
			lastServiceMiles: T(7000),
			lastServiceHours: T(200),
		},
		today: "2026-06-01",
		warnMiles: DEFAULT_WARN_MILES,
		warnHours: DEFAULT_WARN_HOURS,
		warnDays: DEFAULT_WARN_DAYS,
		...overrides,
	};
}

describe("miles dimension", () => {
	test("OK when far from threshold", () => {
		const r = evaluateTask(
			base({
				currentMiles: T(11000),
				task: {
					...base().task,
					milesEnabled: true,
					milesInterval: T(5000),
				},
			}),
		);
		expect(r.miles.state).toBe("OK");
		expect(r.miles.remainingMeter).toBe(T(1000));
		expect(r.status).toBe("OK");
		expect(r.driving).toBe("miles");
	});

	test("DUE_SOON within warn threshold", () => {
		const r = evaluateTask(
			base({
				currentMiles: T(11800),
				task: { ...base().task, milesEnabled: true, milesInterval: T(5000) },
			}),
		);
		expect(r.miles.state).toBe("DUE_SOON");
		expect(r.status).toBe("DUE_SOON");
	});

	test("warn threshold is exclusive above", () => {
		const r = evaluateTask(
			base({
				currentMiles: T(11499),
				task: { ...base().task, milesEnabled: true, milesInterval: T(5000) },
			}),
		);
		// remaining = 501 mi > warn 500
		expect(r.miles.state).toBe("OK");
	});

	test("exactly at threshold is DUE", () => {
		const r = evaluateTask(
			base({
				currentMiles: T(12000),
				task: { ...base().task, milesEnabled: true, milesInterval: T(5000) },
			}),
		);
		expect(r.miles.state).toBe("DUE");
		expect(r.miles.remainingMeter).toBe(0);
		expect(r.status).toBe("DUE");
	});

	test("past threshold is OVERDUE with negative remaining", () => {
		const r = evaluateTask(
			base({
				currentMiles: T(12300),
				task: { ...base().task, milesEnabled: true, milesInterval: T(5000) },
			}),
		);
		expect(r.miles.state).toBe("OVERDUE");
		expect(r.miles.remainingMeter).toBe(T(-300));
		expect(r.status).toBe("OVERDUE");
	});
});

describe("hours dimension", () => {
	test("uses the hours warn threshold, not the miles one", () => {
		// 5 hours remaining: DUE_SOON under warnHours=10 even though it would be
		// OK under the miles threshold of 500.
		const r = evaluateTask(
			base({
				task: {
					...base().task,
					hoursEnabled: true,
					hoursInterval: T(100),
					lastServiceHours: T(245),
				},
			}),
		);
		expect(r.hours.state).toBe("DUE_SOON");
		expect(r.status).toBe("DUE_SOON");
		expect(r.driving).toBe("hours");
	});

	test("hours OVERDUE with miles OK makes the whole task OVERDUE", () => {
		const r = evaluateTask(
			base({
				task: {
					milesEnabled: true,
					milesInterval: T(5000),
					hoursEnabled: true,
					hoursInterval: T(30),
					calendarEnabled: false,
					calendarValue: null,
					calendarUnit: null,
					lastServiceDate: "2026-01-01",
					lastServiceMiles: T(8000),
					lastServiceHours: T(300),
				},
			}),
		);
		expect(r.miles.state).toBe("OK"); // due at 13,000, current 12,000
		expect(r.hours.state).toBe("OVERDUE"); // due at 330, current 340
		expect(r.status).toBe("OVERDUE");
		expect(r.driving).toBe("hours");
	});
});

describe("whichever-comes-first precedence", () => {
	const dualTask = {
		milesEnabled: true,
		milesInterval: T(5000), // due at 12,000 mi
		hoursEnabled: true,
		hoursInterval: T(50), // due at 250 h
		calendarEnabled: true,
		calendarValue: 6,
		calendarUnit: "months" as const,
		lastServiceDate: "2026-01-01",
		lastServiceMiles: T(7000),
		lastServiceHours: T(200),
	};
	// Comfortably inside every dualTask threshold at the same time.
	const dualBase = (overrides: Partial<EngineInput> = {}) =>
		base({ currentMiles: T(10000), currentHours: T(210), ...overrides });

	test("worst dimension wins: miles OK, hours OK, calendar DUE_SOON", () => {
		const r = evaluateTask(dualBase({ today: "2026-06-15", task: { ...dualTask } }));
		// next due 2026-07-01 → 16 days left, within warn 30
		expect(r.miles.state).toBe("OK");
		expect(r.hours.state).toBe("OK");
		expect(r.calendar.state).toBe("DUE_SOON");
		expect(r.status).toBe("DUE_SOON");
		expect(r.driving).toBe("calendar");
	});

	test("worst dimension wins: hours overdue beats miles OK", () => {
		const r = evaluateTask(
			dualBase({
				currentHours: T(260),
				task: { ...dualTask, calendarEnabled: false, calendarValue: null, calendarUnit: null },
			}),
		);
		expect(r.miles.state).toBe("OK");
		expect(r.hours.state).toBe("OVERDUE");
		expect(r.status).toBe("OVERDUE");
		expect(r.driving).toBe("hours");
	});

	test("ties resolve to miles for stable rendering", () => {
		const r = evaluateTask(
			dualBase({
				currentMiles: T(12100),
				currentHours: T(255),
				task: { ...dualTask, calendarEnabled: false, calendarValue: null, calendarUnit: null },
			}),
		);
		expect(r.miles.state).toBe("OVERDUE");
		expect(r.hours.state).toBe("OVERDUE");
		expect(r.status).toBe("OVERDUE");
		expect(r.driving).toBe("miles");
	});

	test("calendar overdue with both meters OK", () => {
		const r = evaluateTask(dualBase({ today: "2027-01-01", task: { ...dualTask } }));
		expect(r.miles.state).toBe("OK");
		expect(r.hours.state).toBe("OK");
		expect(r.calendar.state).toBe("OVERDUE");
		expect(r.status).toBe("OVERDUE");
		expect(r.driving).toBe("calendar");
	});

	test("all OK stays OK", () => {
		const r = evaluateTask(dualBase({ today: "2026-02-01", task: { ...dualTask } }));
		expect(r.miles.state).toBe("OK");
		expect(r.hours.state).toBe("OK");
		expect(r.calendar.state).toBe("OK");
		expect(r.status).toBe("OK");
		// driving picks the first non-unknown dimension at equal rank
		expect(r.driving).toBe("miles");
	});
});

describe("unknown dimensions", () => {
	test("disabled dimension is unknown with reason disabled", () => {
		const r = evaluateTask(base());
		expect(r.miles).toEqual({
			enabled: false,
			state: "UNKNOWN",
			nextDueMeter: null,
			remainingMeter: null,
			unknownReason: "disabled",
		});
	});

	test("enabled without interval is unknown and makes task NEEDS_BASELINE", () => {
		const r = evaluateTask(
			base({ task: { ...base().task, milesEnabled: true, milesInterval: null } }),
		);
		expect(r.miles.unknownReason).toBe("no_interval");
		expect(r.status).toBe("NEEDS_BASELINE");
		expect(r.explanation).toContain("miles interval");
	});

	test("enabled without last service is unknown", () => {
		const r = evaluateTask(
			base({
				task: {
					...base().task,
					milesEnabled: true,
					milesInterval: T(5000),
					lastServiceMiles: null,
				},
			}),
		);
		expect(r.miles.unknownReason).toBe("no_last_service");
		expect(r.status).toBe("NEEDS_BASELINE");
	});

	test("no current meter keeps threshold but hides remaining", () => {
		const r = evaluateTask(
			base({
				currentMiles: null,
				task: { ...base().task, milesEnabled: true, milesInterval: T(5000) },
			}),
		);
		expect(r.miles.unknownReason).toBe("no_current_meter");
		expect(r.miles.nextDueMeter).toBe(T(12000));
		expect(r.miles.remainingMeter).toBeNull();
		expect(r.status).toBe("NEEDS_BASELINE");
	});

	test("dimension enabled but equipment lacks that meter", () => {
		const r = evaluateTask(
			base({
				hasHours: false,
				currentHours: null,
				task: { ...base().task, hoursEnabled: true, hoursInterval: T(100) },
			}),
		);
		expect(r.hours.unknownReason).toBe("no_meter_on_equipment");
		expect(r.status).toBe("NEEDS_BASELINE");
		expect(r.explanation).toContain("equipment has no hour meter");
	});

	test("one unknown dimension does not mask an overdue one", () => {
		const r = evaluateTask(
			base({
				task: {
					milesEnabled: true,
					milesInterval: T(5000),
					hoursEnabled: true,
					hoursInterval: T(100),
					calendarEnabled: false,
					calendarValue: null,
					calendarUnit: null,
					lastServiceDate: "2026-01-01",
					lastServiceMiles: T(7000), // overdue: 7000+5000 < 12000? no, due at 12000 exactly → DUE
					lastServiceHours: null, // hours clock unknown
				},
			}),
		);
		expect(r.hours.unknownReason).toBe("no_last_service");
		expect(r.miles.state).toBe("DUE");
		expect(r.status).toBe("DUE");
		expect(r.driving).toBe("miles");
	});
});

describe("calendar-only tasks", () => {
	test("seasonal task on time alone", () => {
		const r = evaluateTask(
			base({
				today: "2026-05-01",
				task: {
					milesEnabled: false,
					milesInterval: null,
					hoursEnabled: false,
					hoursInterval: null,
					calendarEnabled: true,
					calendarValue: 6,
					calendarUnit: "months",
					lastServiceDate: "2026-01-15",
					lastServiceMiles: null,
					lastServiceHours: null,
				},
			}),
		);
		expect(r.calendar.nextDueDate).toBe("2026-07-15");
		expect(r.calendar.remainingDays).toBe(75);
		expect(r.status).toBe("OK");
		expect(r.driving).toBe("calendar");
	});

	test("month clamp keeps day-of-month valid", () => {
		const r = evaluateTask(
			base({
				today: "2026-02-01",
				task: {
					milesEnabled: false,
					milesInterval: null,
					hoursEnabled: false,
					hoursInterval: null,
					calendarEnabled: true,
					calendarValue: 1,
					calendarUnit: "months",
					lastServiceDate: "2026-01-31",
					lastServiceMiles: null,
					lastServiceHours: null,
				},
			}),
		);
		expect(r.calendar.nextDueDate).toBe("2026-02-28");
	});

	test("calendar without last service date is unknown", () => {
		const r = evaluateTask(
			base({
				task: {
					milesEnabled: false,
					milesInterval: null,
					hoursEnabled: false,
					hoursInterval: null,
					calendarEnabled: true,
					calendarValue: 3,
					calendarUnit: "months",
					lastServiceDate: null,
					lastServiceMiles: null,
					lastServiceHours: null,
				},
			}),
		);
		expect(r.calendar.unknownReason).toBe("no_last_service");
		expect(r.status).toBe("NEEDS_BASELINE");
	});
});

describe("no dimensions at all", () => {
	test("fully unshaped task is NEEDS_BASELINE with no driving dimension", () => {
		const r = evaluateTask(base());
		expect(r.status).toBe("NEEDS_BASELINE");
		expect(r.driving).toBeNull();
	});
});
