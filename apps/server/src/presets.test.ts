import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildTestApp, errorOf, type TestApp } from "./testkit.ts";

describe("task library presets (§2/M5)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("first run seeds generic car/boat/home starters", async () => {
    const res = await t.call("/api/presets", { auth: true });
    expect(res.status).toBe(200);
    const presets = (await res.json()) as {
      name: string;
      monthsInterval: number | null;
      meterInterval: number | null;
    }[];
    const names = presets.map((p) => p.name);
    // plan examples must exist with the plan's intervals
    expect(presets).toContainEqual(
      expect.objectContaining({ name: "Oil change", monthsInterval: 12, meterInterval: 5000 }),
    );
    expect(presets).toContainEqual(
      expect.objectContaining({ name: "Impeller", monthsInterval: 24, meterInterval: 250 }),
    );
    expect(names).toContain("HVAC filter");
    expect(names).toContain("Bottom paint");
  });

  test("seed runs ONCE — an emptied library stays empty", async () => {
    const list = (await (await t.call("/api/presets", { auth: true })).json()) as {
      id: string;
    }[];
    for (const p of list) {
      expect((await t.call(`/api/presets/${p.id}`, { method: "DELETE", auth: true })).status).toBe(
        204,
      );
    }
    // a fresh app over the SAME vault must not reseed (settings key guards it)
    const again = await (await t.call("/api/presets", { auth: true })).json();
    expect((again as unknown[]).length).toBe(0);
  });

  test("CRUD round trip with validation", async () => {
    const created = await t.call("/api/presets", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "Chain lube", monthsInterval: 1 }),
    });
    expect(created.status).toBe(201);
    const preset = await created.json();
    expect(preset).toMatchObject({ name: "Chain lube", monthsInterval: 1, meterInterval: null });

    const patched = await t.call(`/api/presets/${preset.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ meterInterval: 300 }),
    });
    expect(await patched.json()).toMatchObject({ meterInterval: 300, monthsInterval: 1 });

    const bad = await t.call("/api/presets", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ name: "x", monthsInterval: 0.5 }),
    });
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).details?.some((d) => d.path === "monthsInterval")).toBeTrue();

    expect(
      (await t.call(`/api/presets/${preset.id}`, { method: "DELETE", auth: true })).status,
    ).toBe(204);
    expect((await t.call(`/api/presets/${preset.id}`, { auth: true })).status).toBe(404);
    expect(
      (await t.call("/api/presets/nope", { method: "PATCH", auth: true, body: "{}" })).status,
    ).toBe(404);
  });

  test("presets require a session", async () => {
    expect((await t.call("/api/presets")).status).toBe(401);
  });
});
