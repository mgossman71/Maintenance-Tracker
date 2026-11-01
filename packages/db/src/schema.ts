import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Storage conventions (build-plan.md):
 * - ids are uuid text; timestamps are UTC ISO strings; calendar dates are
 *   'YYYY-MM-DD' local-date strings.
 * - every meter value column is integer tenths of the equipment unit.
 */

/**
 * Timestamps are always set by application code (UTC ISO strings); no DB
 * defaults so generated migrations stay portable.
 */
const timestamps = {
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
};

export const equipment = sqliteTable(
	"equipment",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		category: text("category"),
		make: text("make"),
		model: text("model"),
		year: integer("year"),
		description: text("description"),
		meterKind: text("meter_kind", { enum: ["miles", "hours", "none"] }).notNull(),
		currentMeter: integer("current_meter"), // tenths
		meterVerifiedAt: text("meter_verified_at"),
		archivedAt: text("archived_at"),
		...timestamps,
	},
	(t) => [index("equipment_archived_idx").on(t.archivedAt)],
);

export const meterReadings = sqliteTable(
	"meter_readings",
	{
		id: text("id").primaryKey(),
		equipmentId: text("equipment_id")
			.notNull()
			.references(() => equipment.id, { onDelete: "cascade" }),
		value: integer("value").notNull(), // tenths
		mode: text("mode", { enum: ["increase", "confirm", "correction"] }).notNull(),
		recordedAt: text("recorded_at").notNull(),
	},
	(t) => [index("meter_readings_equipment_idx").on(t.equipmentId, t.recordedAt)],
);

export const maintenanceTasks = sqliteTable(
	"maintenance_tasks",
	{
		id: text("id").primaryKey(),
		equipmentId: text("equipment_id")
			.notNull()
			.references(() => equipment.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		presetId: text("preset_id"),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		// Independent dimension flags: disabling a dimension never erases its interval.
		meterEnabled: integer("meter_enabled", { mode: "boolean" }).notNull().default(true),
		meterInterval: integer("meter_interval"), // tenths
		calendarEnabled: integer("calendar_enabled", { mode: "boolean" }).notNull().default(false),
		calendarValue: integer("calendar_value"),
		calendarUnit: text("calendar_unit", { enum: ["days", "weeks", "months", "years"] }),
		...timestamps,
	},
	(t) => [index("tasks_equipment_idx").on(t.equipmentId, t.enabled)],
);

export const maintenanceEvents = sqliteTable(
	"maintenance_events",
	{
		id: text("id").primaryKey(),
		equipmentId: text("equipment_id")
			.notNull()
			.references(() => equipment.id, { onDelete: "cascade" }),
		taskId: text("task_id").references(() => maintenanceTasks.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		source: text("source", { enum: ["service", "baseline"] })
			.notNull()
			.default("service"),
		performedOn: text("performed_on").notNull(), // YYYY-MM-DD
		meter: integer("meter"), // tenths
		notes: text("notes"),
		serviceProvider: text("service_provider"),
		costCents: integer("cost_cents"),
		partsUsed: text("parts_used"),
		...timestamps,
	},
	(t) => [
		index("events_equipment_idx").on(t.equipmentId, t.performedOn),
		index("events_task_idx").on(t.taskId, t.performedOn),
	],
);

export const taskPresets = sqliteTable("task_presets", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	suggestMeterInterval: integer("suggest_meter_interval"), // tenths
	suggestCalendarValue: integer("suggest_calendar_value"),
	suggestCalendarUnit: text("suggest_calendar_unit", {
		enum: ["days", "weeks", "months", "years"],
	}),
	sortOrder: integer("sort_order").notNull().default(0),
	isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
	hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
	...timestamps,
});

export const equipmentDocuments = sqliteTable(
	"equipment_documents",
	{
		id: text("id").primaryKey(),
		equipmentId: text("equipment_id")
			.notNull()
			.references(() => equipment.id, { onDelete: "cascade" }),
		storedName: text("stored_name").notNull(), // random safe name on disk
		filename: text("filename").notNull(), // original display filename
		mimeType: text("mime_type").notNull(), // sniffed
		byteLength: integer("byte_length").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(t) => [index("documents_equipment_idx").on(t.equipmentId)],
);

export const eventAttachments = sqliteTable(
	"event_attachments",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => maintenanceEvents.id, { onDelete: "cascade" }),
		storedName: text("stored_name").notNull(),
		filename: text("filename").notNull(),
		mimeType: text("mime_type").notNull(),
		byteLength: integer("byte_length").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(t) => [index("attachments_event_idx").on(t.eventId)],
);

export const sessions = sqliteTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		tokenHash: text("token_hash").notNull(),
		createdAt: text("created_at").notNull(),
		lastSeenAt: text("last_seen_at").notNull(),
		expiresAt: text("expires_at").notNull(), // absolute lifespan
	},
	(t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash)],
);

/** Simple key/value settings store (password hash, warning thresholds, etc.). */
export const appSettings = sqliteTable("app_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export type EquipmentRow = typeof equipment.$inferSelect;
export type MeterReadingRow = typeof meterReadings.$inferSelect;
export type MaintenanceTaskRow = typeof maintenanceTasks.$inferSelect;
export type MaintenanceEventRow = typeof maintenanceEvents.$inferSelect;
export type TaskPresetRow = typeof taskPresets.$inferSelect;
export type EquipmentDocumentRow = typeof equipmentDocuments.$inferSelect;
export type EventAttachmentRow = typeof eventAttachments.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
