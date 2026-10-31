import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildTestApp, makeEquipment, type TestApp } from "./testkit.ts";

interface DashEquip {
  name: string;
  staleMeter: { reason: string; daysSince: number } | null;
  tasks: { name: string; due: { status: string } }[];
  counts: { overdue: number; dueSoon: number; ok: number };
}

describe("dashboard payload (M7)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();

    // busy: one overdue (expired 2020), one fine (2099)
    const busy = await makeEquipment(t, { name: "Busy Car", meterKind: "miles" });
    await t.call(`/api/equipment/${busy.id}/tasks`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({
        name: "Old registration",
        kind: "expiry",
        currentExpiryDate: "2020-01-01",
      }),
    });
    await t.call(`/api/equipment/${busy.id}/tasks`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({
        name: "Future registration",
        kind: "expiry",
        currentExpiryDate: "2099-01-01",
      }),
    });
    // stale meter: reading from 2026-05-01, clock "today" is 2026-06-15
    await t.call(`/api/equipment/${busy.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 1000, date: "2026-05-01" }),
    });

    const shed = await makeEquipment(t, { name: "Quiet Shed" }); // no meter, no tasks
    void shed;
  });
  afterAll(() => t.close());

  test("equipment blocks: urgency sort, urgency-sorted tasks, totals", async () => {
    const payload = await (await t.call("/api/dashboard", { auth: true })).json();
    expect(payload.equipment.map((e: DashEquip) => e.name)).toEqual(["Busy Car", "Quiet Shed"]);

    const busy = payload.equipment[0] as DashEquip;
    expect(busy.counts).toEqual({ overdue: 1, dueSoon: 0, ok: 1 });
    expect(busy.tasks.map((x) => [x.name, x.due.status])).toEqual([
      ["Old registration", "overdue"],
      ["Future registration", "ok"],
    ]);
    expect(payload.totals).toEqual({ overdue: 1, dueSoon: 0 });
  });

  test("meter freshness: 45-day-old reading nags, meterless never does", async () => {
    const payload = await (await t.call("/api/dashboard", { auth: true })).json();
    const busy = payload.equipment[0] as DashEquip;
    expect(busy.staleMeter).toEqual({ reason: "old_reading", daysSince: 45 });

    const shed = payload.equipment[1] as DashEquip;
    expect(shed.staleMeter).toBeNull();
  });

  test("fresh meter and never-recorded meter verdicts", async () => {
    const eq = await makeEquipment(t, { name: "Diligent Van", meterKind: "hours" });
    let payload = await (await t.call("/api/dashboard", { auth: true })).json();
    let van = payload.equipment.find((e: DashEquip) => e.name === "Diligent Van") as DashEquip;
    expect(van.staleMeter?.reason).toBe("never_recorded");

    await t.call(`/api/equipment/${eq.id}/reading`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ reading: 10, date: "2026-06-10" }),
    });
    payload = await (await t.call("/api/dashboard", { auth: true })).json();
    van = payload.equipment.find((e: DashEquip) => e.name === "Diligent Van") as DashEquip;
    expect(van.staleMeter).toBeNull();
  });
});
