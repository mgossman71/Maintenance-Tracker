/*
 * Dual-meter migration: meter_kind (miles|hours|none) -> has_miles/has_hours.
 * Statement order matters: add new columns, backfill them from the legacy
 * columns, and only then drop the legacy columns.
 */
ALTER TABLE `equipment` ADD `has_miles` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `has_hours` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `current_miles` integer;--> statement-breakpoint
ALTER TABLE `equipment` ADD `current_hours` integer;--> statement-breakpoint
ALTER TABLE `equipment` ADD `miles_verified_at` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `hours_verified_at` text;--> statement-breakpoint
ALTER TABLE `maintenance_events` ADD `meter_miles` integer;--> statement-breakpoint
ALTER TABLE `maintenance_events` ADD `meter_hours` integer;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` ADD `miles_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` ADD `miles_interval` integer;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` ADD `hours_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` ADD `hours_interval` integer;--> statement-breakpoint
ALTER TABLE `meter_readings` ADD `kind` text DEFAULT 'miles' NOT NULL;--> statement-breakpoint

UPDATE equipment SET
	has_miles = CASE WHEN meter_kind = 'miles' THEN 1 ELSE 0 END,
	has_hours = CASE WHEN meter_kind = 'hours' THEN 1 ELSE 0 END,
	current_miles = CASE WHEN meter_kind = 'miles' THEN current_meter ELSE NULL END,
	current_hours = CASE WHEN meter_kind = 'hours' THEN current_meter ELSE NULL END,
	miles_verified_at = CASE WHEN meter_kind = 'miles' THEN meter_verified_at ELSE NULL END,
	hours_verified_at = CASE WHEN meter_kind = 'hours' THEN meter_verified_at ELSE NULL END;--> statement-breakpoint

/* A legacy task's meter dimension used the equipment's unit. */
UPDATE maintenance_tasks SET
	miles_enabled = CASE WHEN meter_enabled = 1 AND (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_tasks.equipment_id) = 'miles' THEN 1 ELSE 0 END,
	miles_interval = CASE WHEN (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_tasks.equipment_id) = 'miles' THEN meter_interval ELSE NULL END,
	hours_enabled = CASE WHEN meter_enabled = 1 AND (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_tasks.equipment_id) = 'hours' THEN 1 ELSE 0 END,
	hours_interval = CASE WHEN (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_tasks.equipment_id) = 'hours' THEN meter_interval ELSE NULL END;--> statement-breakpoint

/* Event readings belonged to the equipment's unit as well. */
UPDATE maintenance_events SET
	meter_miles = CASE WHEN (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_events.equipment_id) = 'miles' THEN meter ELSE NULL END,
	meter_hours = CASE WHEN (SELECT meter_kind FROM equipment e WHERE e.id = maintenance_events.equipment_id) = 'hours' THEN meter ELSE NULL END;--> statement-breakpoint

UPDATE meter_readings SET kind = CASE WHEN (SELECT meter_kind FROM equipment e WHERE e.id = meter_readings.equipment_id) = 'hours' THEN 'hours' ELSE 'miles' END;--> statement-breakpoint

ALTER TABLE `equipment` DROP COLUMN `meter_kind`;--> statement-breakpoint
ALTER TABLE `equipment` DROP COLUMN `current_meter`;--> statement-breakpoint
ALTER TABLE `equipment` DROP COLUMN `meter_verified_at`;--> statement-breakpoint
ALTER TABLE `maintenance_events` DROP COLUMN `meter`;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` DROP COLUMN `meter_enabled`;--> statement-breakpoint
ALTER TABLE `maintenance_tasks` DROP COLUMN `meter_interval`;
