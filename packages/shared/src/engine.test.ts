import { describe, expect, test } from "bun:test";
import { type EngineInput, type EngineTaskInput, evaluateTask } from "./engine";

const mi = (miles: number) => Math.round(miles * 10);
const hr = (hours: number) => Math.round(hours * 10);

const DEFAULT_TASK: EngineTaskInput = {
	meterEnabled: true,
	meterInterval: null,
	calendarEnabled: false,
	calendarValue: null,
	calendarUnit: null,
	lastServiceDate: null,
	lastServiceMeter: null,
};

interface Overrides {
	meterKind?: EngineInput["meterKind"];
	currentMeter?: number | null;
	task?: Partial<EngineTaskInput>;
	today?: string;
	warnMiles?: number;
	warnHours?: number;
	warnDays?: number;
}

function input(overrides: Overrides = {}): EngineInput {
	return {
		meterKind: overrides.meterKind ?? "miles",
		currentMeter: overrides.currentMeter ?? null,
		task: { ...DEFAULT_TASK, ...overrides.task },
		today: overrides.today ?? "2026-06-15",
		warnMiles: overrides.warnMiles ?? 500,
		warnHours: overrides.warnHours ?? 10,
		warnDays: overrides.warnDays ?? 30,
	};
}

describe("mandatory examples from the build plan", () => {
	// Last oil change 10,000 mi, interval 5,000 mi -> next at 15,000 mi.
	test("next due is last service meter plus interval", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(10_000),
				task: { meterInterval: mi(5_000), lastServiceMeter: mi(10_000) },
			}),
		);
		expect(r.meter.nextDueMeter).toBe(mi(15_000));
		expect(r.status).toBe("OK"); // 5,000 miles remaining is outside the 500-mile warn
	});

	test("interval change to 3,000 immediately moves next due to 13,000", () => {
		const base = { lastServiceMeter: mi(10_000) };
		const before = evaluateTask(
			input({ currentMeter: mi(12_000), task: { meterInterval: mi(5_000), ...base } }),
		);
		expect(before.meter.nextDueMeter).toBe(mi(15_000));
		const after = evaluateTask(
			input({ currentMeter: mi(12_000), task: { meterInterval: mi(3_000), ...base } }),
		);
		expect(after.meter.nextDueMeter).toBe(mi(13_000));
	});

	test("12,600 current -> DUE_SOON for 13,000 with 500-mile warn", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(12_600),
				task: { meterInterval: mi(3_000), lastServiceMeter: mi(10_000) },
			}),
		);
		expect(r.status).toBe("DUE_SOON");
	});

	test("13,000 current -> DUE at exactly zero", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(13_000),
				task: { meterInterval: mi(3_000), lastServiceMeter: mi(10_000) },
			}),
		);
		expect(r.status).toBe("DUE");
	});

	test("13,100 current -> OVERDUE", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(13_100),
				task: { meterInterval: mi(3_000), lastServiceMeter: mi(10_000) },
			}),
		);
		expect(r.status).toBe("OVERDUE");
	});

	test("service completed at 13,100 -> next at 16,100", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(13_100),
				task: { meterInterval: mi(3_000), lastServiceMeter: mi(13_100) },
			}),
		);
		expect(r.meter.nextDueMeter).toBe(mi(16_100));
		expect(r.status).toBe("OK");
	});

	test("repeat interval edits 5,000 -> 3,000 -> 7,500 recalculate from same history", () => {
		const base = { lastServiceMeter: mi(10_000) };
		const a = evaluateTask(
			input({ currentMeter: mi(12_000), task: { meterInterval: mi(5_000), ...base } }),
		);
		const b = evaluateTask(
			input({ currentMeter: mi(12_000), task: { meterInterval: mi(3_000), ...base } }),
		);
		const c = evaluateTask(
			input({ currentMeter: mi(12_000), task: { meterInterval: mi(7_500), ...base } }),
		);
		expect([a.meter.nextDueMeter, b.meter.nextDueMeter, c.meter.nextDueMeter]).toEqual([
			mi(15_000),
			mi(13_000),
			mi(17_500),
		]);
	});

	test("Jan 15 2026 + 12 months -> Jan 15 2027", () => {
		const r = evaluateTask(
			input({
				task: {
					meterEnabled: false,
					calendarEnabled: true,
					calendarValue: 12,
					calendarUnit: "months",
					lastServiceDate: "2026-01-15",
				},
			}),
		);
		expect(r.calendar.nextDueDate).toBe("2027-01-15");
	});

	test("combined 5,000 mi / 12 months: overdue date wins over OK miles", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(11_000),
				task: {
					meterEnabled: true,
					meterInterval: mi(5_000),
					lastServiceMeter: mi(10_000),
					calendarEnabled: true,
					calendarValue: 12,
					calendarUnit: "months",
					lastServiceDate: "2025-01-01",
				},
				today: "2026-06-15",
			}),
		);
		expect(r.status).toBe("OVERDUE");
		expect(r.meter.state).toBe("OK");
		expect(r.calendar.state).toBe("OVERDUE");
	});
});

describe("hours equipment", () => {
	test("100-hour ATV schedule with 10-hour warn", () => {
		const r = evaluateTask({
			meterKind: "hours",
			currentMeter: hr(145),
			task: {
				meterEnabled: true,
				meterInterval: hr(100),
				calendarEnabled: false,
				calendarValue: null,
				calendarUnit: null,
				lastServiceDate: null,
				lastServiceMeter: hr(50),
			},
			today: "2026-06-15",
			warnMiles: 500,
			warnHours: 10,
			warnDays: 30,
		});
		expect(r.meter.nextDueMeter).toBe(hr(150));
		expect(r.status).toBe("DUE_SOON");
	});
});

describe("status precedence and unknowns", () => {
	test("no baseline at all -> NEEDS_BASELINE", () => {
		const r = evaluateTask(input({ currentMeter: mi(12_000), task: { meterInterval: mi(5_000) } }));
		expect(r.status).toBe("NEEDS_BASELINE");
	});

	test("unknown current reading -> dimension UNKNOWN but threshold displayed, NEEDS_BASELINE", () => {
		const r = evaluateTask(
			input({
				currentMeter: null,
				task: { meterInterval: mi(5_000), lastServiceMeter: mi(10_000) },
			}),
		);
		expect(r.meter.nextDueMeter).toBe(mi(15_000));
		expect(r.meter.state).toBe("UNKNOWN");
		expect(r.status).toBe("NEEDS_BASELINE");
	});

	test("known dimension OK but other enabled dimension unknown -> NEEDS_BASELINE, not OK", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(10_000),
				task: {
					meterEnabled: true,
					meterInterval: mi(5_000),
					lastServiceMeter: mi(10_000),
					calendarEnabled: true,
					calendarValue: 6,
					calendarUnit: "months",
					lastServiceDate: null,
				},
			}),
		);
		expect(r.meter.state).toBe("OK");
		expect(r.calendar.state).toBe("UNKNOWN");
		expect(r.status).toBe("NEEDS_BASELINE");
	});

	test("one overdue + one unknown reports known urgency", () => {
		const r = evaluateTask(
			input({
				currentMeter: mi(16_000),
				task: {
					meterEnabled: true,
					meterInterval: mi(5_000),
					lastServiceMeter: mi(10_000),
					calendarEnabled: true,
					calendarValue: 6,
					calendarUnit: "months",
					lastServiceDate: null,
				},
			}),
		);
		expect(r.status).toBe("OVERDUE");
	});

	test("calendar-only task never requires a meter", () => {
		const r = evaluateTask(
			input({
				meterKind: "none",
				currentMeter: null,
				task: {
					meterEnabled: false,
					calendarEnabled: true,
					calendarValue: 30,
					calendarUnit: "days",
					lastServiceDate: "2026-06-01",
				},
				today: "2026-06-15",
			}),
		);
		expect(r.status).toBe("DUE_SOON"); // 16 days remaining is inside the 30-day warn
		expect(r.calendar.remainingDays).toBe(16);
	});
});

describe("warning boundaries", () => {
	const metersAt = (current: number) =>
		evaluateTask(
			input({
				currentMeter: mi(current),
				task: { meterInterval: mi(5_000), lastServiceMeter: mi(10_000) },
			}),
		).status;

	test("exactly 500 remaining is DUE_SOON, 500.1 remaining is OK", () => {
		expect(metersAt(14_500)).toBe("DUE_SOON"); // boundary inclusive
		expect(metersAt(14_499.9)).toBe("OK");
	});

	test("due-soon boundary at 10 hours (inclusive)", () => {
		const at = (current: number) =>
			evaluateTask({
				...input(),
				meterKind: "hours",
				currentMeter: hr(current),
				task: {
					meterEnabled: true,
					meterInterval: hr(100),
					lastServiceMeter: hr(100),
					calendarEnabled: false,
					calendarValue: null,
					calendarUnit: null,
					lastServiceDate: null,
				},
			}).status;
		expect(at(190)).toBe("DUE_SOON"); // exactly 10h remaining = warn boundary
		expect(at(189.9)).toBe("OK"); // 10.1h remaining is outside warn
	});
});

describe("decimal precision (tenths storage)", () => {
	test("127.5 + 50 hours = exactly 177.5; DUE at exactly zero", () => {
		const r = evaluateTask({
			...input(),
			meterKind: "hours",
			currentMeter: hr(177.5),
			task: {
				meterEnabled: true,
				meterInterval: hr(50),
				lastServiceMeter: hr(127.5),
				calendarEnabled: false,
				calendarValue: null,
				calendarUnit: null,
				lastServiceDate: null,
			},
		});
		expect(r.meter.nextDueMeter).toBe(hr(177.5));
		expect(r.status).toBe("DUE");
	});

	test("no floating-point drift: 0.1 + 0.2 problem cannot appear", () => {
		const r = evaluateTask({
			...input(),
			meterKind: "hours",
			currentMeter: hr(0.3),
			task: {
				meterEnabled: true,
				meterInterval: hr(0.2),
				lastServiceMeter: hr(0.1),
				calendarEnabled: false,
				calendarValue: null,
				calendarUnit: null,
				lastServiceDate: null,
			},
		});
		expect(r.meter.nextDueMeter).toBe(3); // exactly 0.3 in tenths
		expect(r.status).toBe("DUE");
	});
});
