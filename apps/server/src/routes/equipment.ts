import type { AppDatabase } from "@mt/db";
import { maintenanceTasks } from "@mt/db";
import {
	equipmentCreateInput,
	equipmentUpdateInput,
	eventCreateInput,
	readingUpdateInput,
	taskCreateInput,
	todayLocalDate,
} from "@mt/shared";
import { asc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { deleteStoredFile } from "../http/uploads";
import { parse } from "../http/validation";
import {
	applyReading,
	createEquipment,
	deleteEquipment,
	getEquipmentRow,
	listEquipment,
	listReadings,
	updateEquipment,
} from "../services/equipment";
import { createEvent, listEvents } from "../services/events";
import { attachmentsForEvents, storedFilesForEquipment } from "../services/files";
import { readSettings } from "../services/settings";
import {
	computeTaskStatus,
	latestApplicableEvent,
	toEquipmentDto,
	toEventDto,
	toTaskDto,
} from "../services/status";
import { createTask } from "../services/tasks";
import type { AppVariables } from "../types";

export function registerEquipmentRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	app.get("/api/equipment", (c) => {
		const archived = c.req.query("archived") === "true";
		return c.json(listEquipment(db, archived));
	});

	app.post("/api/equipment", async (c) => {
		const input = parse(equipmentCreateInput, await c.req.json().catch(() => null));
		return c.json(createEquipment(db, input), 201);
	});

	app.get("/api/equipment/:id", (c) => {
		const row = getEquipmentRow(db, c.req.param("id"));
		return c.json(toEquipmentDto(row));
	});

	app.patch("/api/equipment/:id", async (c) => {
		const input = parse(equipmentUpdateInput, await c.req.json().catch(() => null));
		return c.json(updateEquipment(db, c.req.param("id"), input));
	});

	app.delete("/api/equipment/:id", (c) => {
		// Remove all owned upload files from disk before the FK cascade drops rows.
		for (const name of storedFilesForEquipment(db, c.req.param("id"))) {
			deleteStoredFile(config.dataDir, name);
		}
		deleteEquipment(db, c.req.param("id"));
		return c.json({ ok: true });
	});

	// Reading history (audit trail; corrections flagged separately).
	app.get("/api/equipment/:id/readings", (c) => {
		getEquipmentRow(db, c.req.param("id"));
		return c.json(listReadings(db, c.req.param("id")));
	});

	// Update / confirm / correct the current reading with an explicit mode.
	app.post("/api/equipment/:id/reading", async (c) => {
		const input = parse(readingUpdateInput, await c.req.json().catch(() => null));
		const value = "value" in input ? input.value : null;
		return c.json(applyReading(db, c.req.param("id"), input.mode, value));
	});

	// Tasks with computed due status.
	app.get("/api/equipment/:id/tasks", (c) => {
		const equipmentId = c.req.param("id");
		const equipmentRow = getEquipmentRow(db, equipmentId);
		const settings = readSettings(db);
		const today = todayLocalDate(config.timezone);
		const tasks = db
			.select()
			.from(maintenanceTasks)
			.where(eq(maintenanceTasks.equipmentId, equipmentId))
			.orderBy(asc(maintenanceTasks.name))
			.all();
		const result = tasks.map((task) => {
			const events = listEvents(db, equipmentId, task.id);
			const latest = latestApplicableEvent(events);
			return {
				task: toTaskDto(task),
				status: computeTaskStatus(task, equipmentRow, latest, settings, today),
			};
		});
		return c.json(result);
	});

	app.post("/api/equipment/:id/tasks", async (c) => {
		const input = parse(taskCreateInput, await c.req.json().catch(() => null));
		return c.json(createTask(db, c.req.param("id"), input), 201);
	});

	// Event history (newest service date first), optional ?taskId= filter.
	// Each event carries its attachments for inline display.
	app.get("/api/equipment/:id/events", (c) => {
		const equipmentId = c.req.param("id");
		getEquipmentRow(db, equipmentId);
		const taskId = c.req.query("taskId");
		const events = listEvents(db, equipmentId, taskId ?? undefined).map(toEventDto);
		const attachments = attachmentsForEvents(
			db,
			events.map((e) => e.id),
		);
		return c.json(events.map((e) => ({ ...e, attachments: attachments.get(e.id) ?? [] })));
	});

	app.post("/api/equipment/:id/events", async (c) => {
		const input = parse(eventCreateInput, await c.req.json().catch(() => null));
		const { event, warning } = createEvent(db, c.req.param("id"), input);
		return c.json({ event, warning }, 201);
	});
}
