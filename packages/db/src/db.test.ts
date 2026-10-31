import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, runMigrations } from "./client.ts";
import { appSettings } from "./schema.ts";

test("migrations create app_settings; re-running is a no-op; table is usable", () => {
  const dir = mkdtempSync(join(tmpdir(), "mt-db-test-"));
  try {
    const { sqlite, db } = openDatabase(join(dir, "t.db"));

    runMigrations(db);
    runMigrations(db); // idempotent (startup runs it every boot)

    db.insert(appSettings).values({ key: "theme", value: "dark" }).run();
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("dark");
    expect(rows[0]?.updatedAt).toInclude("T"); // default timestamp populated

    sqlite.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
