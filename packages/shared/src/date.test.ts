import { describe, expect, test } from "bun:test";
import {
  addCalendarMonths,
  daysBetween,
  daysInMonth,
  formatIsoDate,
  isValidIsoDate,
  parseIsoDate,
  todayInTz,
} from "./date.ts";

describe("parseIsoDate / isValidIsoDate", () => {
  test("parses valid dates", () => {
    expect(parseIsoDate("2026-01-31")).toEqual({ year: 2026, month: 1, day: 31 });
    expect(isValidIsoDate("2024-02-29")).toBe(true); // leap
  });

  test("rejects malformed input", () => {
    for (const bad of ["", "2026-1-31", "2026-13-01", "2026-00-01", "2026-01-32", "now"]) {
      expect(isValidIsoDate(bad)).toBe(false);
    }
    expect(() => parseIsoDate("2026-02-30")).not.toThrow(); // shape-valid; calendar truth is clamping's job
  });
});

describe("addCalendarMonths — clamped, never ratcheting (pinned in build-plan §4)", () => {
  test("end-of-month clamping", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
    expect(addCalendarMonths("2026-01-30", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addCalendarMonths("2026-05-31", 1)).toBe("2026-06-30");
  });

  test("no ratchet: every addition is computed from the ORIGINAL day", () => {
    expect(addCalendarMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addCalendarMonths("2026-01-31", 13)).toBe("2027-02-28");
  });

  test("year rollover and anniversary stability", () => {
    expect(addCalendarMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addCalendarMonths("2026-01-15", 12)).toBe("2027-01-15");
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28"); // leap day clamps next year
    expect(addCalendarMonths("2024-02-29", 48)).toBe("2028-02-29"); // returns on a leap year
  });

  test("rejects non-integer intervals", () => {
    expect(() => addCalendarMonths("2026-01-15", 1.5)).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  test("sign and magnitude", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-01-02")).toBe(1);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1); // non-leap
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap
  });
});

describe("daysInMonth / formatIsoDate", () => {
  test("leap and short months", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(formatIsoDate(2026, 1, 5)).toBe("2026-01-05");
  });
});

describe("todayInTz — the single timezone seam", () => {
  // One instant, five zones, two different local days.
  const instant = Date.parse("2026-01-01T00:30:00Z");

  test.each([
    ["UTC", "2026-01-01"],
    ["Asia/Tokyo", "2026-01-01"], // +9, same new-year day
    ["America/New_York", "2025-12-31"], // −5, still old year
    ["America/Los_Angeles", "2025-12-31"], // −8
    ["Pacific/Kiritimati", "2026-01-01"], // +14, later same day
  ] satisfies [string, string][] as [string, string][])("%s", (tz, expected) => {
    expect(todayInTz(instant, tz)).toBe(expected);
  });

  test("+14 crosses INTO the next day while UTC still sits on the prior one", () => {
    const i = Date.parse("2026-07-14T10:30:00Z");
    expect(todayInTz(i, "UTC")).toBe("2026-07-14");
    expect(todayInTz(i, "Pacific/Kiritimati")).toBe("2026-07-15");
  });

  test("DST transitions do not shift the day", () => {
    // 2026-03-08 is US spring-forward: 2am → 3am in New York
    expect(todayInTz(Date.parse("2026-03-08T07:30:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(todayInTz(Date.parse("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });

  test("unknown zone throws — config problem, not engine guesswork", () => {
    expect(() => todayInTz(instant, "Mars/Olympus_Mons")).toThrow(RangeError);
  });
});
