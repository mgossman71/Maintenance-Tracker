import { describe, expect, test } from "bun:test";
import type { EngineEquipment, EngineIntervention, EngineTask, TaskDue } from "./domain.ts";
import { computeTaskDue, DUE_SOON_FRACTION } from "./engine.ts";

// ---- fixtures -------------------------------------------------------------

const eq = (over: Partial<EngineEquipment> = {}): EngineEquipment => ({
  meterKind: "none",
  reading: null,
  readingUpdatedAt: null,
  ...over,
});

const task = (over: Partial<EngineTask> = {}): EngineTask => ({
  id: "t1",
  kind: "interval",
  monthsInterval: null,
  meterInterval: null,
  baselineMeter: null,
  currentExpiryDate: null,
  createdAt: "2026-06-01",
  ...over,
});

const iv = (
  id: string,
  date: string,
  over: Partial<EngineIntervention> = {},
): EngineIntervention => ({
  id,
  taskId: "t1",
  equipmentId: "e1",
  date,
  meterAt: null,
  expiryDate: null,
  ...over,
});

const run = (
  t: EngineTask,
  equipment: EngineEquipment,
  interventions: EngineIntervention[],
  nowIso: string, // e.g. "2026-07-14T23:30:00Z"
  tz = "UTC",
): TaskDue => computeTaskDue({ task: t, equipment, interventions, nowMs: Date.parse(nowIso), tz });

// ---- months-only tasks -----------------------------------------------------

describe("months-only interval tasks", () => {
  const months = task({ monthsInterval: 6 });
  const done = [iv("i1", "2026-01-15")]; // next due 2026-07-15

  const table: [string, string, TaskDue["status"]][] = [
    ["fresh after service", "2026-01-16T12:00:00Z", "ok"],
    ["day before due (inside 10%/min-7 window)", "2026-07-14T12:00:00Z", "due-soon"],
    ["exactly due today", "2026-07-15T12:00:00Z", "overdue"],
    ["a week late", "2026-07-22T12:00:00Z", "overdue"],
  ];
  test.each(table)("%s", (_label, now, expected) => {
    const due = run(months, eq(), done, now);
    expect(due.status).toBe(expected);
    expect(due.nextDueDate).toBe("2026-07-15");
  });

  test("just outside the due-soon window stays ok", () => {
    // span Jan15→Jul15 = 181 days → soonDays = max(7, ceil(18.1)) = 19
    const due = run(months, eq(), done, "2026-06-20T12:00:00Z"); // 25 days left
    expect(due.status).toBe("ok");
    expect(due.remainingDays).toBe(25);
    expect(due.reasons).toContain("months_ok");
  });

  test("boundary: exactly soonDays out is due-soon, one more is ok", () => {
    expect(run(months, eq(), done, "2026-06-26T12:00:00Z").status).toBe("due-soon"); // 19
    expect(run(months, eq(), done, "2026-06-25T12:00:00Z").status).toBe("ok"); // 20
  });

  test("engine end-to-end clamping: Jan 31 + 1 month due Feb 28", () => {
    const due = run(
      task({ monthsInterval: 1 }),
      eq(),
      [iv("i1", "2026-01-31")],
      "2026-02-27T12:00:00Z",
    );
    expect(due.nextDueDate).toBe("2026-02-28");
    expect(due.remainingDays).toBe(1);
    expect(due.status).toBe("due-soon");
  });
});

// ---- meter-only tasks ------------------------------------------------------

describe("meter-only interval tasks (miles)", () => {
  const miles = task({ meterInterval: 5000 });
  const done = [iv("i1", "2026-01-10", { meterAt: 45000 })];
  const car = (reading: number | null) =>
    eq({ meterKind: "miles", reading, readingUpdatedAt: "2026-06-01" });
  const now = "2026-06-15T12:00:00Z";

  const table: [string, number, TaskDue["status"], number][] = [
    ["comfortably early", 47000, "ok", 3000],
    ["exactly at the 10% line", 49500, "due-soon", 500],
    ["50 mi left", 49950, "due-soon", 50],
    ["exactly due", 50000, "overdue", 0],
    ["overdue", 52000, "overdue", -2000],
  ];
  test.each(table)("%s", (_label, reading, status, remaining) => {
    const due = run(miles, car(reading), done, now);
    expect(due.status).toBe(status);
    expect(due.remainingMeter).toBe(remaining);
    expect(due.nextDueMeter).toBe(50000);
    expect(due.nextDueDate).toBeNull(); // meter-only → no date claim
  });

  test("fractional hours work (2.5 h boats, really)", () => {
    const hours = task({ meterInterval: 100 });
    const due = run(
      hours,
      eq({ meterKind: "hours", reading: 127.5 }),
      [iv("i1", "2026-01-01", { meterAt: 50 })],
      now,
    );
    expect(due.nextDueMeter).toBeCloseTo(150);
    expect(due.remainingMeter).toBeCloseTo(22.5);
    expect(due.status).toBe("ok");
  });

  test("meter reference walks back past meter-less interventions", () => {
    const history = [
      iv("i1", "2026-01-01", { meterAt: 45000 }),
      iv("i2", "2026-03-01", { meterAt: null }), // inspection, no odometer
    ];
    const due = run(miles, car(49000), history, now);
    expect(due.nextDueMeter).toBe(50000); // reference from i1, not "missing" from i2
    expect(due.remainingMeter).toBe(1000);
    expect(due.status).toBe("ok");
  });

  test("10% line uses exact fraction: one hair above is ok", () => {
    const reading = 45000 + 5000 * DUE_SOON_FRACTION + 0.5; // 500.5 left
    expect(run(miles, car(reading), done, now).status).toBe("ok");
  });
});

// ---- composition + isolation -----------------------------------------------

describe("interval tasks with BOTH components", () => {
  const both = task({ monthsInterval: 12, meterInterval: 5000 });
  const done = [iv("i1", "2025-07-01", { meterAt: 45000 })]; // months due 2026-07-01

  test("meter overdue + months ok → overdue; both next-dues reported", () => {
    const due = run(both, eq({ meterKind: "miles", reading: 51000 }), done, "2026-01-15T12:00:00Z");
    expect(due.status).toBe("overdue");
    expect(due.reasons).toContain("meter_overdue");
    expect(due.reasons).toContain("months_ok");
    expect(due.nextDueDate).toBe("2026-07-01");
    expect(due.nextDueMeter).toBe(50000);
  });

  test("months due-soon + meter ok → due-soon", () => {
    const due = run(both, eq({ meterKind: "miles", reading: 46000 }), done, "2026-06-25T12:00:00Z");
    expect(due.status).toBe("due-soon");
  });

  test("other tasks' interventions are ignored", () => {
    const due = run(
      both,
      eq({ meterKind: "miles", reading: 46000 }),
      [...done, iv("other", "2025-01-01", { taskId: "t9", meterAt: 1 })],
      "2026-01-15T12:00:00Z",
    );
    expect(due.nextDueMeter).toBe(50000); // i1's 45000, not t9's 1
    expect(due.reasons).not.toContain("meter_baseline_created"); // t1 sees its own history
  });
});

// ---- fresh tasks: anchored at their start, never overdue on day one ----------

describe("no-history states anchor at the task's start", () => {
  const now = "2026-06-15T12:00:00Z";

  test("months task never done → counts from its creation date", () => {
    const due = run(task({ monthsInterval: 6, createdAt: "2026-06-01" }), eq(), [], now);
    expect(due.status).toBe("ok");
    expect(due.nextDueDate).toBe("2026-12-01");
    expect(due.reasons).toContain("months_baseline_created");
  });

  test("a months task CREATED LONG ENOUGH AGO does go overdue", () => {
    const due = run(task({ monthsInterval: 6, createdAt: "2025-01-10" }), eq(), [], now);
    expect(due.status).toBe("overdue");
    expect(due.nextDueDate).toBe("2025-07-10");
  });

  test("meter task never done → counts from the CURRENT reading", () => {
    const due = run(
      task({ meterInterval: 5000 }),
      eq({ meterKind: "miles", reading: 47000 }),
      [iv("i1", "2026-01-01", { meterAt: null })],
      now,
    );
    expect(due.status).toBe("ok");
    expect(due.nextDueMeter).toBe(52000);
    expect(due.remainingMeter).toBe(5000);
    expect(due.reasons).toContain("meter_baseline_created");
  });

  test("a pinned baseline, not the rotating reading, anchors the count", () => {
    const due = run(
      task({ meterInterval: 5000, baselineMeter: 40000 }),
      eq({ meterKind: "miles", reading: 42000 }),
      [],
      now,
    );
    expect(due.status).toBe("ok");
    expect(due.nextDueMeter).toBe(45000); // baseline 40,000 + 5,000 — not reading + 5,000
    expect(due.remainingMeter).toBe(3000);
    expect(due.reasons).toContain("meter_baseline_created");
  });

  // the reported bug: 1,000-unit interval, first reading 600 becomes the
  // baseline (server backfill) → due at 1,600, NOT overdue
  test("the Sporster S case: 1000 interval, first reading 600 → due at 1600", () => {
    const due = run(
      task({ meterInterval: 1000, baselineMeter: 600, createdAt: "2026-06-15" }),
      eq({ meterKind: "miles", reading: 600, readingUpdatedAt: "2026-06-15" }),
      [],
      now,
    );
    expect(due.status).toBe("ok");
    expect(due.nextDueMeter).toBe(1600);
    expect(due.remainingMeter).toBe(1000);
  });

  test("reading climbs past the pinned baseline → eventually overdue", () => {
    const due = run(
      task({ meterInterval: 1000, baselineMeter: 600 }),
      eq({ meterKind: "miles", reading: 1750 }),
      [],
      now,
    );
    expect(due.status).toBe("overdue");
    expect(due.remainingMeter).toBe(-150);
  });

  test("meter task, equipment reading missing → due-soon, never overdue-on-nothing", () => {
    const due = run(
      task({ meterInterval: 5000 }),
      eq({ meterKind: "miles", reading: null }),
      [iv("i1", "2026-01-01", { meterAt: 45000 })],
      now,
    );
    expect(due.status).toBe("due-soon");
    expect(due.reasons).toContain("no_current_reading");
    expect(due.remainingMeter).toBeNull();
    expect(due.nextDueMeter).toBeNull();
  });

  test("meter interval on meterless equipment degrades loudly (API blocks it at M5)", () => {
    const due = run(
      task({ meterInterval: 100 }),
      eq(),
      [iv("i1", "2026-01-01", { meterAt: 10 })],
      now,
    );
    expect(due.status).toBe("due-soon");
    expect(due.reasons).toContain("meter_on_none_equipment");
  });

  test("same-date tie-break is stable (ids decide)", () => {
    const due = run(
      task({ meterInterval: 5000 }),
      eq({ meterKind: "miles", reading: 46000 }),
      [iv("a", "2026-01-01", { meterAt: 40000 }), iv("b", "2026-01-01", { meterAt: 45000 })],
      now,
    );
    expect(due.nextDueMeter).toBe(50000); // "b" wins deterministically
  });
});

// ---- expiry tasks ------------------------------------------------------------

describe("expiry tasks", () => {
  const expiry = (date: string | null) => task({ kind: "expiry", currentExpiryDate: date });
  const now = "2026-06-15T12:00:00Z";

  const table: [string, string | null, TaskDue["status"], number | null][] = [
    ["expired last week", "2026-06-08", "overdue", -7],
    ["expires today", "2026-06-15", "overdue", 0],
    ["29 days out", "2026-07-14", "due-soon", 29],
    ["exactly 30 days out", "2026-07-15", "due-soon", 30],
    ["31 days out", "2026-07-16", "ok", 31],
  ];
  test.each(table)("%s", (_label, date, status, days) => {
    const due = run(expiry(date), eq(), [], now);
    expect(due.status).toBe(status);
    expect(due.remainingDays).toBe(days);
    expect(due.nextDueDate).toBe(date);
  });

  test("expiry without a date → overdue with reason", () => {
    const due = run(expiry(null), eq(), [], now);
    expect(due.status).toBe("overdue");
    expect(due.reasons).toContain("no_expiry_date");
    expect(due.nextDueDate).toBeNull();
  });
});

// ---- the TZ matrix, end to end -----------------------------------------------

describe("timezone matrix: one instant, different verdicts (build-plan §4)", () => {
  // months task next due exactly 2026-07-15 (last service 2026-01-15, 6 mo)
  const months = task({ monthsInterval: 6 });
  const done = [iv("i1", "2026-01-15")];
  const instant = "2026-07-14T23:30:00Z"; // UTC still Jul 14; +14 is already Jul 15

  test.each([
    ["UTC", "due-soon"], // today Jul 14 → 1 day left
    ["America/Los_Angeles", "due-soon"], // −7 PDT → Jul 14 afternoon
    ["Asia/Tokyo", "overdue"], // +9 → Jul 15 08:30 — already due
    ["Pacific/Kiritimati", "overdue"], // +14 → Jul 15 13:30
    ["Pacific/Pago_Pago", "due-soon"], // −11 → still Jul 14
  ] satisfies [string, TaskDue["status"]][] as [
    string,
    TaskDue["status"],
  ][])("%s → %s", (tz, expected) => {
    expect(run(months, eq(), done, instant, tz).status).toBe(expected);
  });

  test("new year flips between zones at the same instant", () => {
    const nyEveTask = task({ monthsInterval: 1 });
    const done2 = [iv("i1", "2025-12-31")]; // +1 month → 2026-01-31, pick instant on the day boundary
    const i = "2026-01-31T00:30:00Z";
    expect(run(nyEveTask, eq(), done2, i, "UTC").status).toBe("overdue"); // Jan 31, due
    expect(run(nyEveTask, eq(), done2, i, "America/New_York").status).toBe("due-soon"); // Jan 30 evening
  });
});
