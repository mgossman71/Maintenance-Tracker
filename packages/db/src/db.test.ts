import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { openDatabase, runMigrations } from "./client.ts";
import {
  appSettings,
  attachment,
  type DatabaseHandle,
  equipment,
  intervention,
  session,
  task,
  taskPreset,
} from "./index.ts";

let dir: string;
let handle: DatabaseHandle;
let db: DatabaseHandle["db"];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mt-db-test-"));
  handle = openDatabase(join(dir, "t.db"));
  db = handle.db;
  runMigrations(db);
  runMigrations(db); // idempotent (startup runs it every boot)
});

afterAll(() => {
  handle.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("app_settings (M0 pipeline proof)", () => {
  test("insert with default timestamp, select back", () => {
    db.insert(appSettings).values({ key: "theme", value: "dark" }).run();
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("dark");
    expect(rows[0]?.updatedAt).toInclude("T");
  });
});

describe("full domain graph", () => {
  test("equipment → task → intervention → attachment, plus preset and session", () => {
    db.insert(equipment)
      .values({ id: "eq1", name: "Truck", meterKind: "miles", reading: 50000 })
      .run();
    db.insert(task)
      .values({
        id: "t1",
        equipmentId: "eq1",
        name: "Oil change",
        kind: "interval",
        meterInterval: 5000,
      })
      .run();
    db.insert(intervention)
      .values({ id: "i1", taskId: "t1", equipmentId: "eq1", date: "2026-01-10", meterAt: 45000 })
      .run();
    db.insert(attachment)
      .values({
        id: "a1",
        equipmentId: "eq1",
        interventionId: "i1",
        filename: "receipt.pdf",
        storedName: "a1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1234,
      })
      .run();
    db.insert(taskPreset)
      .values({ id: "p1", name: "Oil change", monthsInterval: 12, meterInterval: 5000 })
      .run();
    db.insert(session)
      .values({ id: "s1", expiresAt: "2026-12-31T00:00:00Z", lastSeenAt: "2026-01-01T00:00:00Z" })
      .run();

    expect(db.select().from(task).where(eq(task.equipmentId, "eq1")).all()).toHaveLength(1);
    expect(db.select().from(intervention).where(eq(intervention.taskId, "t1")).all()).toHaveLength(
      1,
    );
  });

  test("deleting equipment cascades tasks → interventions → attachments", () => {
    db.delete(equipment).where(eq(equipment.id, "eq1")).run();
    expect(db.select().from(task).all()).toHaveLength(0);
    expect(db.select().from(intervention).all()).toHaveLength(0);
    expect(db.select().from(attachment).all()).toHaveLength(0);
  });

  test("equipment-level work: no taskId, but a label (task XOR label)", () => {
    db.insert(equipment).values({ id: "eq2", name: "Boiler", meterKind: "none" }).run();
    db.insert(intervention)
      .values({ id: "i2", equipmentId: "eq2", label: "Annual service", date: "2026-02-01" })
      .run();
    expect(db.select().from(intervention).where(eq(intervention.id, "i2")).all()).toHaveLength(1);
    db.delete(intervention).where(eq(intervention.id, "i2")).run();
  });
});

describe("CHECK constraints reject nonsense at the file level (§6.9 defense in depth)", () => {
  beforeAll(() => {
    db.insert(equipment).values({ id: "eqc", name: "Check car", meterKind: "miles" }).run();
  });

  const rejected = (label: string, fn: () => unknown) => {
    test(label, () => expect(fn).toThrow());
  };

  rejected("interval task with neither months nor meter interval", () =>
    db.insert(task).values({ id: "bad1", equipmentId: "eqc", name: "x", kind: "interval" }).run(),
  );
  rejected("expiry task carrying intervals", () =>
    db
      .insert(task)
      .values({ id: "bad2", equipmentId: "eqc", name: "x", kind: "expiry", monthsInterval: 3 })
      .run(),
  );
  rejected("unknown task kind", () =>
    db.insert(task).values({ id: "bad3", equipmentId: "eqc", name: "x", kind: "vibes" }).run(),
  );
  rejected("months interval below 1", () =>
    db
      .insert(task)
      .values({ id: "bad4", equipmentId: "eqc", name: "x", kind: "interval", monthsInterval: 0 })
      .run(),
  );
  rejected("meter interval of zero", () =>
    db
      .insert(task)
      .values({ id: "bad5", equipmentId: "eqc", name: "x", kind: "interval", meterInterval: 0 })
      .run(),
  );
  rejected("unknown meter kind", () =>
    db.insert(equipment).values({ id: "bad6", name: "x", meterKind: "furlongs" }).run(),
  );
  rejected("negative equipment reading", () =>
    db.insert(equipment).values({ id: "bad7", name: "x", meterKind: "miles", reading: -1 }).run(),
  );
  rejected("intervention with neither taskId nor label", () =>
    db.insert(intervention).values({ id: "bad8", equipmentId: "eqc", date: "2026-01-01" }).run(),
  );
  rejected("intervention with BOTH taskId and label", () => {
    db.insert(task)
      .values({ id: "tlabel", equipmentId: "eqc", name: "x", kind: "interval", monthsInterval: 3 })
      .run();
    db.insert(intervention)
      .values({
        id: "bad9",
        taskId: "tlabel",
        equipmentId: "eqc",
        label: "double",
        date: "2026-01-01",
      })
      .run();
  });
  rejected("negative meterAt", () =>
    db
      .insert(intervention)
      .values({ id: "bad10", equipmentId: "eqc", label: "x", date: "2026-01-01", meterAt: -5 })
      .run(),
  );
  rejected("orphan intervention (FK)", () =>
    db
      .insert(intervention)
      .values({ id: "bad11", equipmentId: "nope", label: "x", date: "2026-01-01" })
      .run(),
  );
});

describe("migration 0003 data fix: legacy shortcut Service tasks → absolute meter point", () => {
  test("re-anchors only the never-serviced shortcut signature, leaves the rest", () => {
    db.insert(equipment)
      .values({ id: "eqmig", name: "Sporster", meterKind: "miles", reading: 600 })
      .run();
    const legacy = (id: string, over: Record<string, unknown> = {}) =>
      db
        .insert(task)
        .values({
          id,
          equipmentId: "eqmig",
          name: "Service",
          kind: "interval",
          monthsInterval: 12,
          meterInterval: 1000,
          baselineMeter: 600, // pinned from the first reading — old semantics
          ...over,
        })
        .run();
    legacy("mig1"); // the reported shape → must become due AT 1,000 (baseline 0)
    legacy("mig2"); // has metered work → untouched
    db.insert(intervention)
      .values({
        id: "migi",
        taskId: "mig2",
        equipmentId: "eqmig",
        date: "2026-06-01",
        meterAt: 600,
      })
      .run();
    legacy("mig3", { name: "Oil change" }); // hand-made task → untouched
    legacy("mig4", { monthsInterval: 6 }); // not the shortcut's 12-month signature
    legacy("mig5", { baselineMeter: null }); // baseline not yet pinned → untouched

    // replay the data fix (idempotent UPDATE — already applied at open time)
    const file = join(import.meta.dir, "../migrations/0003_service_meter_point.sql");
    db.run(sql.raw(readFileSync(file, "utf8")));

    const baselines = Object.fromEntries(
      db
        .select({ id: task.id, baselineMeter: task.baselineMeter })
        .from(task)
        .where(eq(task.equipmentId, "eqmig"))
        .all()
        .map((r) => [r.id, r.baselineMeter]),
    );
    expect(baselines.mig1).toBe(0);
    expect(baselines.mig2).toBe(600);
    expect(baselines.mig3).toBe(600);
    expect(baselines.mig4).toBe(600);
    expect(baselines.mig5).toBeNull();
  });
});
