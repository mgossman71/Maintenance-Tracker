/** CLI: apply pending migrations to MT_DATA_DIR/mt.db. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, runMigrations } from "./client.ts";

const dataDir = process.env.MT_DATA_DIR ?? "data";
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const { sqlite, db } = openDatabase(join(dataDir, "mt.db"));
runMigrations(db);
sqlite.close();
console.log(`migrations applied to ${join(dataDir, "mt.db")}`);
