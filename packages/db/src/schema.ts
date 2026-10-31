import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Simple key/value settings store. Real typed settings (theme, auth)
 * arrive in M2/M8; this proves the schema→migrations→repos pipeline.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type AppSetting = typeof appSettings.$inferSelect;
