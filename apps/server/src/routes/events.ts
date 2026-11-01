import type { AppDatabase } from "@mt/db";
import { eventUpdateInput } from "@mt/shared";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { deleteStoredFile } from "../http/uploads";
import { parse } from "../http/validation";
import { deleteEvent, updateEvent } from "../services/events";
import { storedFilesForEvent } from "../services/files";
import type { AppVariables } from "../types";

export function registerEventRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	app.patch("/api/events/:id", async (c) => {
		const input = parse(eventUpdateInput, await c.req.json().catch(() => null));
		const { event, warning } = updateEvent(db, c.req.param("id"), input);
		return c.json({ event, warning });
	});

	app.delete("/api/events/:id", (c) => {
		// Remove attachment files from disk before the FK cascade drops rows.
		for (const name of storedFilesForEvent(db, c.req.param("id"))) {
			deleteStoredFile(config.dataDir, name);
		}
		deleteEvent(db, c.req.param("id"));
		return c.json({ ok: true });
	});
}
