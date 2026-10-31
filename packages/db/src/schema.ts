import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Domain model (build-plan.md §4). Dates are YYYY-MM-DD strings, timestamps
 * are ISO-8601 strings; the engine (packages/shared) owns all interpretation.
 * Cross-column invariants get SQLite CHECKs so even a broken API can't write
 * nonsense into the file (defense in depth, §6.9).
 */

export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull().default(""),
    /** Model/build year — free-standing fact, optional. */
    year: integer("year"),
    meterKind: text("meter_kind").notNull().default("none"),
    reading: real("reading"),
    readingUpdatedAt: text("reading_updated_at"), // YYYY-MM-DD
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    check("meter_kind_valid", sql`${t.meterKind} IN ('none', 'hours', 'miles')`),
    check("reading_not_negative", sql`${t.reading} IS NULL OR ${t.reading} >= 0`),
  ],
);

export const task = sqliteTable(
  "task",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull(),
    monthsInterval: integer("months_interval"),
    meterInterval: real("meter_interval"),
    /**
     * Meter reading this task began counting from, before any service was
     * recorded: set at creation from the equipment's reading, or backfilled
     * when the first reading lands. History (metered work) always wins.
     */
    baselineMeter: real("baseline_meter"),
    currentExpiryDate: text("current_expiry_date"), // YYYY-MM-DD, expiry kind
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("task_equipment_idx").on(t.equipmentId),
    check("kind_valid", sql`${t.kind} IN ('interval', 'expiry')`),
    check("months_interval_positive", sql`${t.monthsInterval} IS NULL OR ${t.monthsInterval} >= 1`),
    check("meter_interval_positive", sql`${t.meterInterval} IS NULL OR ${t.meterInterval} > 0`),
    // interval tasks need at least one component…
    check(
      "interval_has_component",
      sql`${t.kind} != 'interval' OR ${t.monthsInterval} IS NOT NULL OR ${t.meterInterval} IS NOT NULL`,
    ),
    // …expiry tasks carry none.
    check(
      "expiry_has_no_intervals",
      sql`${t.kind} != 'expiry' OR (${t.monthsInterval} IS NULL AND ${t.meterInterval} IS NULL)`,
    ),
  ],
);

export const intervention = sqliteTable(
  "intervention",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => task.id, { onDelete: "cascade" }),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    label: text("label"), // required when taskId is null (equipment-level work)
    date: text("date").notNull(), // YYYY-MM-DD
    meterAt: real("meter_at"),
    location: text("location"),
    performedBy: text("performed_by"),
    comments: text("comments"),
    expiryDate: text("expiry_date"), // expiry tasks: new expiry set by this work
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("intervention_task_idx").on(t.taskId),
    index("intervention_equipment_idx").on(t.equipmentId),
    index("intervention_date_idx").on(t.date),
    check(
      "task_xor_label",
      sql`(${t.taskId} IS NOT NULL AND ${t.label} IS NULL) OR (${t.taskId} IS NULL AND ${t.label} IS NOT NULL)`,
    ),
    check("meter_at_not_negative", sql`${t.meterAt} IS NULL OR ${t.meterAt} >= 0`),
  ],
);

/** The editable task library (build-plan.md §2); seeded on first run (M5). */
export const taskPreset = sqliteTable(
  "task_preset",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    monthsInterval: integer("months_interval"),
    meterInterval: real("meter_interval"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("months_interval_positive", sql`${t.monthsInterval} IS NULL OR ${t.monthsInterval} >= 1`),
    check("meter_interval_positive", sql`${t.meterInterval} IS NULL OR ${t.meterInterval} > 0`),
  ],
);

/** Metadata only; bytes live under DATA_DIR/files (serving rules: §6.8, M6). */
export const attachment = sqliteTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    interventionId: text("intervention_id").references(() => intervention.id, {
      onDelete: "cascade",
    }),
    filename: text("filename").notNull(), // original name, display only
    storedName: text("stored_name").notNull(), // on-disk name, extension from sniffed MIME
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("attachment_equipment_idx").on(t.equipmentId)],
);

/** Server-side sessions (§6.2): revocable on logout / password change. */
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

/**
 * Simple key/value settings store (theme, auth hash — M2/M8 flesh out keys).
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type AppSetting = typeof appSettings.$inferSelect;

export type Equipment = typeof equipment.$inferSelect;
export type Task = typeof task.$inferSelect;
export type Intervention = typeof intervention.$inferSelect;
export type TaskPreset = typeof taskPreset.$inferSelect;
export type Attachment = typeof attachment.$inferSelect;
export type Session = typeof session.$inferSelect;
