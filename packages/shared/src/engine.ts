/**
 * The due-status engine — crown jewel (build-plan.md §4).
 *
 * Pure: (task, equipment, interventions, now, tz) → verdict. No DB, no
 * clocks, no randomness. Server and client import the SAME function, so a
 * dashboard can never disagree with the API about what's overdue.
 *
 * Rules encoded here (all tested in engine.test.ts):
 *  1. Months intervals are CALENDAR months with end-of-month clamping.
 *  2. Status composes across components: overdue > due-soon > ok.
 *  3. An interval task with no interventions is DUE NOW (nudge to record
 *     the first service) — reason: no_history.
 *  4. Meter reference = the most recent dated intervention (this task) that
 *     carries a meter reading; current value = the equipment's reading.
 *  5. A meter task on equipment with no current reading is due-SOON (amber
 *     "get a reading" nudge), not overdue — reason: no_current_reading.
 *  6. Due-soon = remaining ≤ 10% of the interval (months: floored at
 *     DUE_SOON_MIN_DAYS; expiry: EXPIRY_SOON_DAYS).
 *  7. Timezone enters ONLY through todayInTz — same instant, different TZ,
 *     a task may flip overdue on one side of a dateline and not the other.
 */

import { addCalendarMonths, daysBetween, todayInTz } from "./date.ts";
import type {
  DueReason,
  DueStatus,
  EngineEquipment,
  EngineIntervention,
  EngineTask,
  TaskDue,
} from "./domain.ts";

/** Remaining fraction (of the interval) at/below which a task turns amber. */
export const DUE_SOON_FRACTION = 0.1;
/** Months components are at least this many days of due-soon warning. */
export const DUE_SOON_MIN_DAYS = 7;
/** Expiry tasks turn amber this many days before the expiry date. */
export const EXPIRY_SOON_DAYS = 30;

export interface EngineInput {
  task: EngineTask;
  equipment: EngineEquipment;
  /** May contain interventions for OTHER tasks — the engine filters by taskId. */
  interventions: EngineIntervention[];
  nowMs: number;
  /** IANA zone, e.g. "America/New_York". */
  tz: string;
}

const RANK: Record<DueStatus, number> = { ok: 0, "due-soon": 1, overdue: 2 };

function worst(a: DueStatus, b: DueStatus): DueStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

/** This task's interventions, oldest first (stable: date, then id). */
function historyFor(taskId: string, all: EngineIntervention[]): EngineIntervention[] {
  return all
    .filter((i) => i.taskId === taskId)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

export function computeTaskDue(input: EngineInput): TaskDue {
  const { task } = input;
  const today = todayInTz(input.nowMs, input.tz);
  return task.kind === "expiry"
    ? expiryDue(task, today)
    : intervalDue(task, input.equipment, input.interventions, today);
}

// ---------------------------------------------------------------- expiry

function expiryDue(task: EngineTask, today: string): TaskDue {
  if (task.currentExpiryDate === null) {
    return {
      taskId: task.id,
      status: "overdue",
      nextDueDate: null,
      nextDueMeter: null,
      remainingDays: null,
      remainingMeter: null,
      reasons: ["no_expiry_date"],
    };
  }
  const remaining = daysBetween(today, task.currentExpiryDate);
  const status: DueStatus =
    remaining <= 0 ? "overdue" : remaining <= EXPIRY_SOON_DAYS ? "due-soon" : "ok";
  return {
    taskId: task.id,
    status,
    nextDueDate: task.currentExpiryDate,
    nextDueMeter: null,
    remainingDays: remaining,
    remainingMeter: null,
    reasons: [
      status === "overdue"
        ? "expiry_overdue"
        : status === "due-soon"
          ? "expiry_due_soon"
          : "expiry_ok",
    ],
  };
}

// --------------------------------------------------------------- interval

function intervalDue(
  task: EngineTask,
  equipment: EngineEquipment,
  all: EngineIntervention[],
  today: string,
): TaskDue {
  const history = historyFor(task.id, all);
  const reasons: DueReason[] = [];
  let status: DueStatus = "ok";

  let nextDueDate: string | null = null;
  let remainingDays: number | null = null;
  let nextDueMeter: number | null = null;
  let remainingMeter: number | null = null;

  // ---- months component ----
  if (task.monthsInterval !== null) {
    const last = history.at(-1);
    if (last === undefined) {
      status = worst(status, "overdue");
      reasons.push("no_history");
    } else {
      nextDueDate = addCalendarMonths(last.date, task.monthsInterval);
      remainingDays = daysBetween(today, nextDueDate);
      if (remainingDays <= 0) {
        status = worst(status, "overdue");
        reasons.push("months_overdue");
      } else {
        const span = daysBetween(last.date, nextDueDate);
        const soonDays = Math.max(DUE_SOON_MIN_DAYS, Math.ceil(span * DUE_SOON_FRACTION));
        if (remainingDays <= soonDays) {
          status = worst(status, "due-soon");
          reasons.push("months_due_soon");
        } else {
          reasons.push("months_ok");
        }
      }
    }
  }

  // ---- meter component ----
  if (task.meterInterval !== null) {
    if (equipment.meterKind === "none") {
      // Invalid pairing (API rejects at M5); engine degrades loudly, not silently.
      status = worst(status, "due-soon");
      reasons.push("meter_on_none_equipment");
    } else {
      // (intervention, meterAt) pairs where the meter was recorded; TS keeps
      // the non-null meter through this shape instead of re-widening.
      const metered = history.flatMap((i) =>
        i.meterAt === null ? [] : [{ iv: i, meter: i.meterAt }],
      );
      const lastMeter = metered.at(-1);
      if (lastMeter === undefined) {
        status = worst(status, "overdue");
        reasons.push("no_history");
      } else if (equipment.reading === null) {
        status = worst(status, "due-soon");
        reasons.push("no_current_reading");
      } else {
        nextDueMeter = lastMeter.meter + task.meterInterval;
        remainingMeter = nextDueMeter - equipment.reading;
        if (remainingMeter <= 0) {
          status = worst(status, "overdue");
          reasons.push("meter_overdue");
        } else if (remainingMeter <= task.meterInterval * DUE_SOON_FRACTION) {
          status = worst(status, "due-soon");
          reasons.push("meter_due_soon");
        } else {
          reasons.push("meter_ok");
        }
      }
    }
  }

  return {
    taskId: task.id,
    status,
    nextDueDate,
    nextDueMeter,
    remainingDays,
    remainingMeter,
    reasons,
  };
}
