import type { AppDatabase } from "@mt/db";
import { taskUpdateInput, todayLocalDate } from "@mt/shared";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { parse } from "../http/validation";
import { getEquipmentRow } from "../services/equipment";
import { listEvents } from "../services/events";
import { readSettings } from "../services/settings";
import { computeTaskStatus, latestApplicableEvent, toTaskDto } from "../services/status";
import { deleteTask, getTaskRow, updateTask } from "../services/tasks";
import type { AppVariables } from "../types";

export function registerTaskRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	// A task with its live due status (used by deep links and refresh flows).
	app.get("/api/tasks/:id", (c) => {
		const task = getTaskRow(db, c.req.param("id"));
		const equipment = getEquipmentRow(db, task.equipmentId);
		const settings = readSettings(db);
		const latest = latestApplicableEvent(listEvents(db, task.equipmentId, task.id));
		const status = computeTaskStatus(
			task,
			equipment,
			latest,
			settings,
			todayLocalDate(config.timezone),
		);
		return c.json({ task: toTaskDto(task), status });
	});

	// Includes interval editing; recalculates prospectively without touching history.
	app.patch("/api/tasks/:id", async (c) => {
		const input = parse(taskUpdateInput, await c.req.json().catch(() => null));
		return c.json(updateTask(db, c.req.param("id"), input));
	});

	app.delete("/api/tasks/:id", (c) => {
		deleteTask(db, c.req.param("id"));
		return c.json({ ok: true });
	});
}
