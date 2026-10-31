/**
 * Date math for the due-status engine. All calendar dates are plain
 * `YYYY-MM-DD` strings — no timestamps, no ambient-timezone `Date` parsing.
 * Timezone enters exactly once, via `todayInTz`, and everything downstream
 * is pure calendar arithmetic (build-plan.md §4: the TZ test matrix).
 */

/** "2026-01-31" → parts, validated. Throws on malformed input. */
export function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`invalid ISO date: ${date}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31)
    throw new RangeError(`invalid ISO date: ${date}`);
  return { year, month, day };
}

export function isValidIsoDate(date: string): boolean {
  try {
    parseIsoDate(date);
    return true;
  } catch {
    return false;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** Days in the given year/month (month 1–12). Uses UTC epoch — no local-tz drift. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add n calendar months, CLAMPING end-of-month (build-plan.md §4, pinned):
 * Jan 31 + 1 month → Feb 28 (or Feb 29 in leap years), never Mar 2/3.
 * Clamping is computed from the ORIGINAL day every time — Feb 28 + 1 does
 * not ratchet down to Feb 28 forever.
 */
export function addCalendarMonths(date: string, n: number): string {
  if (!Number.isInteger(n)) throw new RangeError(`month interval must be an integer: ${n}`);
  const { year, month, day } = parseIsoDate(date);
  const zeroBased = month - 1 + n;
  const yearShift = Math.floor(zeroBased / 12);
  const targetYear = year + yearShift;
  const targetMonth = zeroBased - yearShift * 12 + 1; // 1..12
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatIsoDate(targetYear, targetMonth, targetDay);
}

/** Whole days from `from` to `to` (negative when to < from). Pure calendar math. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError("invalid ISO date");
  return Math.round((b - a) / 86_400_000);
}

/**
 * "What day is it right now, in tz?" — the engine's single timezone seam.
 * Throws RangeError on an unknown IANA zone (config validation, not engine guessing).
 */
export function todayInTz(nowMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new RangeError(`could not resolve date for tz ${tz}`);
  return `${year}-${month}-${day}`;
}
