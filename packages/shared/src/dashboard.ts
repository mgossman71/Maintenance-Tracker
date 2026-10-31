import type { TaskWithDue } from "./api.ts";
import type { MeterKind } from "./domain.ts";

/**
 * Dashboard payload (M7): one round-trip — every equipment with its tasks
 * already projected through the engine, plus the meter-freshness verdict.
 */
export interface StaleMeter {
  /** Calendar days since the reading was recorded (or would have been). */
  daysSince: number;
  /** "record your first reading" | "N days ago" — why the banner appears. */
  reason: "never_recorded" | "old_reading";
}

export interface DashboardEquipment {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  meterKind: MeterKind;
  reading: number | null;
  readingUpdatedAt: string | null;
  /** Metered equipment with a stale/missing reading gets a freshness banner. */
  staleMeter: StaleMeter | null;
  tasks: TaskWithDue[];
  counts: { overdue: number; dueSoon: number; ok: number };
}

export interface DashboardPayload {
  equipment: DashboardEquipment[];
  totals: { overdue: number; dueSoon: number };
}

/** A meter older than this nags (calendar days). Shared by engine & UI copy. */
export const STALE_METER_DAYS = 30;
