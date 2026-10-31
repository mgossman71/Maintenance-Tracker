import { z } from "zod";

/** What kind of meter an equipment has (build-plan.md §4). Immutable once readings exist. */
export const meterKindSchema = z.enum(["none", "hours", "miles"]);
export type MeterKind = z.infer<typeof meterKindSchema>;

/**
 * interval — due by months and/or meter units.
 * expiry — due by a fixed calendar date (registration, CO detector).
 */
export const taskKindSchema = z.enum(["interval", "expiry"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const dueStatusSchema = z.enum(["overdue", "due-soon", "ok"]);
export type DueStatus = z.infer<typeof dueStatusSchema>;

/** Machine-readable reasons attached to a due-status result. */
export const dueReasonSchema = z.enum([
  "no_history", // interval task, never done → due now (nudge to record first service)
  "no_expiry_date", // expiry task without a date → due now
  "no_current_reading", // meter task but equipment reading is null → can't compute
  "meter_on_none_equipment", // misconfiguration; API validation rejects it (M5)
  "months_overdue",
  "months_due_soon",
  "months_ok",
  "meter_overdue",
  "meter_due_soon",
  "meter_ok",
  "expiry_overdue",
  "expiry_due_soon",
  "expiry_ok",
]);
export type DueReason = z.infer<typeof dueReasonSchema>;

// ---- Engine inputs: plain interfaces; validation lives at API boundaries ----

export interface EngineTask {
  id: string;
  kind: TaskKind;
  /** Calendar months between services (≥1). null = no time component. */
  monthsInterval: number | null;
  /** Meter units between services (>0). null = no meter component. */
  meterInterval: number | null;
  /** YYYY-MM-DD, expiry tasks only. */
  currentExpiryDate: string | null;
}

export interface EngineEquipment {
  meterKind: MeterKind;
  /** Current meter reading in the equipment's units. */
  reading: number | null;
  /** YYYY-MM-DD of when the reading was taken. */
  readingUpdatedAt: string | null;
}

export interface EngineIntervention {
  id: string;
  /** null for equipment-level work (label required instead). */
  taskId: string | null;
  equipmentId: string;
  /** YYYY-MM-DD (date the work was done, in the deployment timezone). */
  date: string;
  /** Meter value at the time of work; never negative, never lowers the meter. */
  meterAt: number | null;
  /** For expiry tasks: the new expiry date this intervention established. */
  expiryDate: string | null;
}

export interface TaskDue {
  taskId: string;
  /** Worst status across components (months, meter) or the expiry verdict. */
  status: DueStatus;
  nextDueDate: string | null; // YYYY-MM-DD
  nextDueMeter: number | null;
  /** Null when no date component (meter-only task) or unknown. */
  remainingDays: number | null;
  /** Null when no meter component or unknown. */
  remainingMeter: number | null;
  reasons: DueReason[];
}
