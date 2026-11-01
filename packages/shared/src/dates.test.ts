import { describe, expect, test } from "bun:test";
import { addCalendarInterval, daysBetween, parseCalendarDate, todayLocalDate } from "./dates";

describe("addCalendarInterval", () => {
	test("days and weeks advance by exact calendar days", () => {
		expect(addCalendarInterval("2026-01-01", 30, "days")).toBe("2026-01-31");
		expect(addCalendarInterval("2026-06-15", 2, "weeks")).toBe("2026-06-29");
		expect(addCalendarInterval("2026-03-01", 1, "weeks")).toBe("2026-03-08");
	});

	test("months clamp invalid days: Jan 31 + 1 month = Feb 28 (non-leap)", () => {
		expect(addCalendarInterval("2026-01-31", 1, "months")).toBe("2026-02-28");
		expect(addCalendarInterval("2024-01-31", 1, "months")).toBe("2024-02-29");
	});

	test("years: Feb 29 leap + 1 year = Feb 28 in non-leap year", () => {
		expect(addCalendarInterval("2024-02-29", 1, "years")).toBe("2025-02-28");
		expect(addCalendarInterval("2024-02-29", 4, "years")).toBe("2028-02-29");
	});

	test("12 months from Jan 15 2026 is Jan 15 2027", () => {
		expect(addCalendarInterval("2026-01-15", 12, "months")).toBe("2027-01-15");
	});

	test("rejects invalid inputs", () => {
		expect(addCalendarInterval("2026-01-15", 0, "months")).toBeNull();
		expect(addCalendarInterval("2026-01-15", 1.5, "months")).toBeNull();
		expect(addCalendarInterval("not-a-date", 1, "months")).toBeNull();
	});
});

describe("daysBetween", () => {
	test("sign and magnitude", () => {
		expect(daysBetween("2026-06-15", "2026-06-15")).toBe(0);
		expect(daysBetween("2026-06-15", "2026-07-15")).toBe(30);
		expect(daysBetween("2026-06-15", "2026-06-01")).toBe(-14);
	});

	test("is DST-immune across spring-forward and fall-back dates", () => {
		// America/Chicago DST transitions in 2026: Mar 8 and Nov 1.
		expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
		expect(daysBetween("2026-10-20", "2026-11-10")).toBe(21);
	});
});

describe("parseCalendarDate", () => {
	test("validates real dates only", () => {
		expect(parseCalendarDate("2026-02-29")).toBeNull(); // 2026 is not a leap year
		expect(parseCalendarDate("2024-02-29")).not.toBeNull();
		expect(parseCalendarDate("2026-13-01")).toBeNull();
		expect(parseCalendarDate("2026-1-1")).toBeNull();
		expect(parseCalendarDate("2026-04-31")).toBeNull();
	});
});

describe("todayLocalDate", () => {
	test("renders the local date per timezone, not the UTC timestamp", () => {
		// 2026-07-04T05:30:00Z is Jul 4 in Chicago (00:30 CDT) and Jul 3 in Honolulu (19:30 HST).
		const now = new Date("2026-07-04T05:30:00Z");
		expect(todayLocalDate("America/Chicago", now)).toBe("2026-07-04");
		expect(todayLocalDate("Pacific/Honolulu", now)).toBe("2026-07-03");
	});

	test("handles UTC+14 (Kiritimati) and UTC-11 boundaries", () => {
		const now = new Date("2026-12-31T12:00:00Z");
		expect(todayLocalDate("Pacific/Kiritimati", now)).toBe("2027-01-01"); // +14 -> Jan 1 02:00
		expect(todayLocalDate("Pacific/Pago_Pago", now)).toBe("2026-12-31"); // -11 -> Dec 31
		expect(todayLocalDate("UTC", now)).toBe("2026-12-31");
	});
});
