import type { AppDatabase } from "@mt/db";
import { taskPresets } from "@mt/db";
import {
	type PresetDto,
	presetCreateInput,
	presetUpdateInput,
	settingsUpdateInput,
} from "@mt/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { parse } from "../http/validation";
import { buildDashboard } from "../services/dashboard";
import { readSettings, updateSettings } from "../services/settings";
import type { AppVariables } from "../types";
import { notFound, nowIso, uuid } from "../util";

export function registerMiscRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	app.get("/api/dashboard", (c) => c.json(buildDashboard(db, config)));

	// --- Presets: editable suggestion library, never applied retroactively ---

	app.get("/api/presets", (c) => {
		const includeHidden = c.req.query("includeHidden") === "true";
		const rows = db.select().from(taskPresets).orderBy(asc(taskPresets.sortOrder)).all();
		const visible = includeHidden ? rows : rows.filter((row) => !row.hidden);
		return c.json(visible.map(toPresetDto));
	});

	app.post("/api/presets", async (c) => {
		const input = parse(presetCreateInput, await c.req.json().catch(() => null));
		const now = nowIso();
		const max = db.get<{ m: number | null }>(sql`SELECT MAX(sort_order) AS m FROM task_presets`);
		const row = {
			id: uuid(),
			name: input.name,
			description: input.description ?? null,
			suggestMeterInterval: input.suggestMeterInterval ?? null,
			suggestCalendarValue: input.suggestCalendarValue ?? null,
			suggestCalendarUnit: input.suggestCalendarUnit ?? null,
			sortOrder: (max?.m ?? -1) + 1,
			isBuiltin: false,
			hidden: false,
			createdAt: now,
			updatedAt: now,
		};
		db.insert(taskPresets).values(row).run();
		return c.json(toPresetDto(row), 201);
	});

	app.patch("/api/presets/:id", async (c) => {
		const existing = getPresetRow(db, c.req.param("id"));
		const input = parse(presetUpdateInput, await c.req.json().catch(() => null));
		const merged = {
			...existing,
			...(input.name !== undefined && { name: input.name }),
			...(input.description !== undefined && { description: input.description }),
			...(input.suggestMeterInterval !== undefined && {
				suggestMeterInterval: input.suggestMeterInterval,
			}),
			...(input.suggestCalendarValue !== undefined && {
				suggestCalendarValue: input.suggestCalendarValue,
			}),
			...(input.suggestCalendarUnit !== undefined && {
				suggestCalendarUnit: input.suggestCalendarUnit,
			}),
			updatedAt: nowIso(),
		};
		db.update(taskPresets).set(merged).where(eq(taskPresets.id, existing.id)).run();
		return c.json(toPresetDto(merged));
	});

	// Built-in presets hide (soft delete) instead of hard deletion.
	app.delete("/api/presets/:id", (c) => {
		const existing = getPresetRow(db, c.req.param("id"));
		if (existing.isBuiltin) {
			db.update(taskPresets)
				.set({ hidden: true, updatedAt: nowIso() })
				.where(eq(taskPresets.id, existing.id))
				.run();
		} else {
			db.delete(taskPresets).where(eq(taskPresets.id, existing.id)).run();
		}
		return c.json({ ok: true });
	});

	// --- Settings ---

	app.get("/api/settings", (c) => c.json(readSettings(db)));

	app.patch("/api/settings", async (c) => {
		const input = parse(settingsUpdateInput, await c.req.json().catch(() => null));
		updateSettings(db, input);
		return c.json(readSettings(db));
	});
}

function getPresetRow(db: AppDatabase, id: string) {
	const row = db.select().from(taskPresets).where(eq(taskPresets.id, id)).get();
	if (!row) throw notFound("Preset");
	return row;
}

function toPresetDto(row: {
	id: string;
	name: string;
	description: string | null;
	suggestMeterInterval: number | null;
	suggestCalendarValue: number | null;
	suggestCalendarUnit: string | null;
	sortOrder: number;
	isBuiltin: boolean;
	hidden: boolean;
}): PresetDto {
	return { ...row };
}
