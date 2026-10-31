import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addCalendarMonths } from "@maintenance-tracker/shared";
import { buildTestApp, errorOf, makeEquipment, type TestApp } from "./testkit.ts";

describe("equipment CRUD", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("create → list → get → patch → delete", async () => {
    const created = await makeEquipment(t, { icon: "🚗", meterKind: "miles" });
    const list = await t.call("/api/equipment", { auth: true });
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const got = await t.call(`/api/equipment/${created.id}`, { auth: true });
    const row = await got.json();
    expect(row).toMatchObject({ name: "Truck", icon: "🚗", meterKind: "miles", reading: null });

    const patched = await t.call(`/api/equipment/${created.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ name: "Big Truck", icon: "🛻" }),
    });
    expect(await patched.json()).toMatchObject({ name: "Big Truck", icon: "🛻" });

    const del = await t.call(`/api/equipment/${created.id}`, { method: "DELETE", auth: true });
    expect(del.status).toBe(204);
    expect((await t.call(`/api/equipment/${created.id}`, { auth: true })).status).toBe(404);
  });

  test("validation: missing name, unknown fields (strict), unknown meter kind", async () => {
    const bad1 = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      body: JSON.stringify({}),
    });
    expect(bad1.status).toBe(400);
    expect((await errorOf(bad1)).details?.some((d) => d.path === "name")).toBeTrue();

    const bad2 = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", isAdmin: true }),
    });
    expect(bad2.status).toBe(400); // strictObject → unknown keys rejected

    const bad3 = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", meterKind: "furlongs" }),
    });
    expect(bad3.status).toBe(400);
  });

  test("meter kind is immutable once readings exist (§4)", async () => {
    const eq = await makeEquipment(t, { name: "Sailboat", meterKind: "hours" });
    // no readings yet → change allowed
    const ok = await t.call(`/api/equipment/${eq.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ meterKind: "miles" }),
    });
    expect(ok.status).toBe(200);

    await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 12.5 }),
    });
    const locked = await t.call(`/api/equipment/${eq.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ meterKind: "hours" }),
    });
    expect(locked.status).toBe(409);
    expect((await errorOf(locked)).code).toBe("meter_kind_immutable");
  });
});

describe("meter readings (§2: never lower silently)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("set, raise, reject lowering, meterless rejected", async () => {
    const eq = await makeEquipment(t, { meterKind: "miles" });
    const first = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 100 }),
    });
    expect(await first.json()).toMatchObject({ reading: 100, readingUpdatedAt: "2026-06-15" });

    const raised = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 150, date: "2026-06-20" }),
    });
    expect(await raised.json()).toMatchObject({ reading: 150, readingUpdatedAt: "2026-06-20" });

    const lower = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 149 }),
    });
    expect(lower.status).toBe(409);
    expect((await errorOf(lower)).code).toBe("meter_regressed");

    // equal reading is always acceptable ("same reading" dismissal is a no-op client-side)
    const same = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 150 }),
    });
    expect(same.status).toBe(200);

    const house = await makeEquipment(t, { name: "House" });
    const meterless = await t.call(`/api/equipment/${house.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 1 }),
    });
    expect(meterless.status).toBe(409);
    expect((await errorOf(meterless)).code).toBe("meterless_equipment");
  });

  test("explicit correct:true is the ONLY way a reading lowers", async () => {
    const eq = await makeEquipment(t, { name: "Clerk's Truck", meterKind: "miles" });
    await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 50_000, date: "2026-06-10" }),
    });

    // typo discovery: 50000 was entered for 5000 — explicit correction lands
    const corrected = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 5_000, date: "2026-06-10", correct: true }),
    });
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({
      reading: 5_000,
      readingUpdatedAt: "2026-06-10",
    });

    // correct:true is ignored when the reading does not regress
    const raised = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 5_100, correct: true }),
    });
    expect(raised.status).toBe(200);

    // …and without the flag, lowering is still rejected (the rule is intact)
    const sneaky = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 1 }),
    });
    expect(sneaky.status).toBe(409);
    expect((await errorOf(sneaky)).code).toBe("meter_regressed");

    // corrections cannot go negative (schema), and meterless stays meterless
    const negative = await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: -1, correct: true }),
    });
    expect(negative.status).toBe(400);

    const boiler = await makeEquipment(t, { name: "Boiler" });
    const meterlessCorrect = await t.call(`/api/equipment/${boiler.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 1, correct: true }),
    });
    expect(meterlessCorrect.status).toBe(409);
    expect((await errorOf(meterlessCorrect)).code).toBe("meterless_equipment");
  });
});

describe("tasks + engine through HTTP", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("interval task with no components rejected with a reason", async () => {
    const eq = await makeEquipment(t);
    const res = await t.call(`/api/equipment/${eq.id}/tasks`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", kind: "interval" }),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details?.[0]?.path).toBe("monthsInterval");
  });

  test("meter interval requires metered equipment", async () => {
    const eq = await makeEquipment(t, { name: "House" });
    const res = await t.call(`/api/equipment/${eq.id}/tasks`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", kind: "interval", meterInterval: 100 }),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details?.[0]?.path).toBe("meterInterval");
  });

  test("expiry task carrying intervals rejected", async () => {
    const eq = await makeEquipment(t);
    const res = await t.call(`/api/equipment/${eq.id}/tasks`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", kind: "expiry", monthsInterval: 6 }),
    });
    expect(res.status).toBe(400);
  });

  test("fresh months task → counts from creation; after intervention → from the work", async () => {
    const eq = await makeEquipment(t);
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "Wax", kind: "interval", monthsInterval: 6 }),
      })
    ).json();
    expect(task.due.status).toBe("ok"); // engine wired, "today" = 2026-06-15
    // anchored at the task's own creation date (wall clock — row defaults to
    // new Date()), so derived, not pinned
    expect(task.due.nextDueDate).toBe(addCalendarMonths(new Date().toISOString().slice(0, 10), 6));
    expect(task.due.reasons).toContain("months_baseline_created");

    await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-01-15" }),
    });

    const tasks = await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json();
    const due = tasks[0].due;
    expect(due.nextDueDate).toBe("2026-07-15");
    expect(due.status).toBe("ok"); // 30 days out, past the 19-day window
    expect(due.remainingDays).toBe(30);
  });

  test("PATCH preserves invariants: strip last component → 400; expiry never gains intervals", async () => {
    const eq = await makeEquipment(t, { meterKind: "miles" });
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "Tires", kind: "interval", monthsInterval: 12 }),
      })
    ).json();

    const strip = await t.call(`/api/tasks/${task.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ monthsInterval: null }),
    });
    expect(strip.status).toBe(400);

    const expiry = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: "Registration",
          kind: "expiry",
          currentExpiryDate: "2027-01-01",
        }),
      })
    ).json();
    const leaky = await t.call(`/api/tasks/${expiry.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ monthsInterval: 3 }),
    });
    expect(leaky.status).toBe(400);
  });

  // the reported bug, end to end: fresh equipment, 1,000-mile Service task,
  // then the first reading of 600 — that must mean "due at 1,600", never
  // overdue, and the count must NOT rotate as later readings climb
  test("Sporster S regression: interval 1000 + first reading 600 → due at 1600", async () => {
    const eq = await makeEquipment(t, { name: "Sporster S", meterKind: "miles" });
    const created = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "Service", kind: "interval", meterInterval: 1000 }),
      })
    ).json();
    expect(created.due.status).toBe("due-soon"); // no reading yet: amber nudge

    const setReading = (reading: number) =>
      t.call(`/api/equipment/${eq.id}/reading`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ reading }),
      });

    await setReading(600);
    let task = (await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json())[0];
    expect(task.due.status).toBe("ok");
    expect(task.due.nextDueMeter).toBe(1600); // baseline 600 + 1,000
    expect(task.due.remainingMeter).toBe(1000);
    expect(task.due.reasons).toContain("meter_baseline_created");

    await setReading(1550);
    task = (await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json())[0];
    expect(task.due.status).toBe("due-soon"); // 50 of 1,000 left
    expect(task.due.remainingMeter).toBe(50);
    expect(task.due.nextDueMeter).toBe(1600); // baseline pinned, not rotated

    await setReading(1750);
    task = (await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json())[0];
    expect(task.due.status).toBe("overdue");
    expect(task.due.remainingMeter).toBe(-150);

    // recording the work re-anchors to the work, baseline irrelevant now
    await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: created.id, date: "2026-06-20", meterAt: 1750 }),
    });
    task = (await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json())[0];
    expect(task.due.status).toBe("ok");
    expect(task.due.nextDueMeter).toBe(2750);
  });
});

describe("interventions + meter/expiry rules", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("task XOR label enforced at the API", async () => {
    const eq = await makeEquipment(t, { name: "Everyday Car", meterKind: "miles" });
    const neither = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ date: "2026-06-01" }),
    });
    expect(neither.status).toBe(400);

    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "Oil", kind: "interval", monthsInterval: 6 }),
      })
    ).json();
    const both = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, label: "belt-and-suspenders", date: "2026-06-01" }),
    });
    expect(both.status).toBe(400);

    const ok = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-06-01" }),
    });
    expect(ok.status).toBe(201);
  });

  test("task must belong to the equipment", async () => {
    const a = await makeEquipment(t, { name: "A" });
    const b = await makeEquipment(t, { name: "B" });
    const task = await (
      await t.call(`/api/equipment/${a.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "T", kind: "interval", monthsInterval: 3 }),
      })
    ).json();
    const res = await t.call(`/api/equipment/${b.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-06-01" }),
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("task_equipment_mismatch");
  });

  test("mileage progression + never-lower via meterAt", async () => {
    const eq = await makeEquipment(t, { name: "Mileage Machine", meterKind: "miles" });
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "Oil", kind: "interval", meterInterval: 5000 }),
      })
    ).json();

    // no reading yet — meterAt 500 establishes it (mileage progression)
    const first = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-01-10", meterAt: 500 }),
    });
    expect(first.status).toBe(201);
    const eqAfter = await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json();
    expect(eqAfter.reading).toBe(500);

    // below current reading → 409
    const lower = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-02-10", meterAt: 400 }),
    });
    expect(lower.status).toBe(409);

    // above → moves the reading forward
    const higher = await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-03-10", meterAt: 900 }),
    });
    expect(higher.status).toBe(201);
    expect((await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json()).reading).toBe(
      900,
    );

    // and the engine now says: reference moved to 900 → due at 5900, 5000 to go
    const tasks = await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json();
    expect(tasks[0].due.nextDueMeter).toBe(5900);
    expect(tasks[0].due.remainingMeter).toBe(5000);
  });

  test("meterAt on meterless equipment → 409", async () => {
    const house = await makeEquipment(t, { name: "Shed" });
    const res = await t.call(`/api/equipment/${house.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ label: "Paint", date: "2026-05-01", meterAt: 10 }),
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("meterless_equipment");
  });

  test("expiry intervention rolls the task's expiry date forward", async () => {
    const eq = await makeEquipment(t, { name: "Boat" });
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: "Registration",
          kind: "expiry",
          currentExpiryDate: "2026-12-01",
        }),
      })
    ).json();
    await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-06-01", expiryDate: "2027-12-01" }),
    });
    const after = await (await t.call(`/api/tasks/${task.id}`, { auth: true })).json();
    expect(after.currentExpiryDate).toBe("2027-12-01");

    // engine: due-soon/ok reflect the NEW date (2027 → ok from 2026-06-15)
    const tasks = await (await t.call(`/api/equipment/${eq.id}/tasks`, { auth: true })).json();
    expect(tasks[0].due.nextDueDate).toBe("2027-12-01");
    expect(tasks[0].due.status).toBe("ok");
  });

  test("delete task cascades its interventions from History", async () => {
    const eq = await makeEquipment(t, { name: "Cascade King" });
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ name: "T", kind: "interval", monthsInterval: 3 }),
      })
    ).json();
    await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ taskId: task.id, date: "2026-01-01" }),
    });
    await t.call(`/api/tasks/${task.id}`, { method: "DELETE", auth: true });
    const history = await (
      await t.call(`/api/equipment/${eq.id}/interventions`, { auth: true })
    ).json();
    expect(history).toHaveLength(0);
  });
});

describe("equipment year", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("create carries the year; absent means null", async () => {
    const withYear = await makeEquipment(t, { name: "Day Truck", year: 1968 });
    const row = await (await t.call(`/api/equipment/${withYear.id}`, { auth: true })).json();
    expect(row.year).toBe(1968);

    const bare = await makeEquipment(t, { name: "No Year" });
    const bareRow = await (await t.call(`/api/equipment/${bare.id}`, { auth: true })).json();
    expect(bareRow.year).toBeNull();
  });

  test("patch sets, clears, and validates the year", async () => {
    const eq = await makeEquipment(t, { name: "Patched Year" });

    await t.call(`/api/equipment/${eq.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ year: 2021 }),
    });
    let row = await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json();
    expect(row.year).toBe(2021);

    await t.call(`/api/equipment/${eq.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ year: null }),
    });
    row = await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json();
    expect(row.year).toBeNull();

    const bad = await t.call(`/api/equipment/${eq.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ year: 1899 }),
    });
    expect(bad.status).toBe(400);
  });
});
