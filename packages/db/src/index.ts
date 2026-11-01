import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate as drizzleMigrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema, Database>>;

const migrationsFolder = join(import.meta.dirname, "..", "drizzle");

/** Open (and create when needed) the application database with sane pragmas. */
export function openDatabase(path: string): Database {
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path, { create: true });
	db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
	return db;
}

export function createAppDatabase(db: Database): AppDatabase {
	return drizzle(db, { schema });
}

/**
 * Apply pending migrations. Append-only: never squash applied migrations.
 * Throws on failure so startup fails loudly rather than partially deploying.
 */
export async function runMigrations(app: AppDatabase): Promise<void> {
	drizzleMigrate(app, { migrationsFolder });
	// Belt-and-braces: confirm core tables exist or fail explicitly.
	const tables = app.all<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('equipment','maintenance_tasks','maintenance_events','task_presets','sessions','app_settings')`,
	);
	if (tables.length < 6) {
		throw new Error(`Migration verification failed: missing tables (found ${tables.length}/6)`);
	}
}

export * from "./presets";
export * from "./schema";
export { schema };
