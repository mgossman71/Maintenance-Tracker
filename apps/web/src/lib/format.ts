import type { MeterKind } from "@/api/client";

/** "12,345 mi" / "1,234 h" — the unit vocabulary lives in one place. */
export function formatReading(value: number, kind: MeterKind): string {
  const num = value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return kind === "miles" ? `${num} mi` : kind === "hours" ? `${num} h` : num;
}

export const METER_UNIT: Record<Exclude<MeterKind, "none">, string> = {
  miles: "miles",
  hours: "hours",
};

/** Human freshness for a reading date, e.g. "today" / "3 days ago". */
export function daysAgo(isoDate: string, now: Date = new Date()): string {
  const then = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(then.getTime())) return isoDate;
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "about a month ago";
  return `${Math.floor(days / 30)} months ago`;
}
