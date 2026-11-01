import type { CalendarUnit } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface CalendarDate {
	year: number;
	month: number; // 1-12
	day: number; // 1-31
}

/** Parse and validate a strict local calendar date string (YYYY-MM-DD). */
export function parseCalendarDate(value: string): CalendarDate | null {
	const m = DATE_RE.exec(value);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
	return { year, month, day };
}

export function isCalendarDate(value: string): boolean {
	return parseCalendarDate(value) !== null;
}

export function toCalendarDateString(date: CalendarDate): string {
	const y = String(date.year).padStart(4, "0");
	const m = String(date.month).padStart(2, "0");
	const d = String(date.day).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, month: number): number {
	// Days in month via UTC arithmetic; month is 1-12 here.
	if (month === 12) return 31;
	return (Date.UTC(year, month, 1) - Date.UTC(year, month - 1, 1)) / DAY_MS;
}

/** Whole-day difference b - a (positive when b is after a). Calendar-exact. */
export function daysBetween(a: string, b: string): number | null {
	const da = parseCalendarDate(a);
	const db = parseCalendarDate(b);
	if (!da || !db) return null;
	return Math.round(
		(Date.UTC(db.year, db.month - 1, db.day) - Date.UTC(da.year, da.month - 1, da.day)) / DAY_MS,
	);
}

/**
 * Add a calendar interval with invalid-day clamping:
 * Jan 31 + 1 month = Feb 28/29; Feb 29 + 1 year = Feb 28 in a non-leap year.
 * Days and weeks advance by exact calendar days.
 */
export function addCalendarInterval(
	from: string,
	value: number,
	unit: CalendarUnit,
): string | null {
	const date = parseCalendarDate(from);
	if (!date || !Number.isInteger(value) || value < 1) return null;

	if (unit === "days" || unit === "weeks") {
		const days = unit === "weeks" ? value * 7 : value;
		const ts = Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS;
		const d = new Date(ts);
		return toCalendarDateString({
			year: d.getUTCFullYear(),
			month: d.getUTCMonth() + 1,
			day: d.getUTCDate(),
		});
	}

	const totalMonths = date.month - 1 + (unit === "months" ? value : value * 12);
	const year = date.year + Math.floor(totalMonths / 12);
	const month = (totalMonths % 12) + 1;
	const day = Math.min(date.day, daysInMonth(year, month));
	return toCalendarDateString({ year, month, day });
}

/**
 * Today's local calendar date in the given IANA timezone (default UTC).
 * Uses Intl calendar-date rendering — no UTC-timestamp masquerading.
 */
export function todayLocalDate(timeZone: string = "UTC", now: Date = new Date()): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	// en-CA renders "YYYY-MM-DD".
	return formatter.format(now);
}
