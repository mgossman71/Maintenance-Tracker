CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`make` text,
	`model` text,
	`year` integer,
	`description` text,
	`meter_kind` text NOT NULL,
	`current_meter` integer,
	`meter_verified_at` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equipment_archived_idx` ON `equipment` (`archived_at`);--> statement-breakpoint
CREATE TABLE `equipment_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`stored_name` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_equipment_idx` ON `equipment_documents` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `event_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`stored_name` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_event_idx` ON `event_attachments` (`event_id`);--> statement-breakpoint
CREATE TABLE `maintenance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`task_id` text,
	`label` text NOT NULL,
	`source` text DEFAULT 'service' NOT NULL,
	`performed_on` text NOT NULL,
	`meter` integer,
	`notes` text,
	`service_provider` text,
	`cost_cents` integer,
	`parts_used` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `maintenance_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_equipment_idx` ON `maintenance_events` (`equipment_id`,`performed_on`);--> statement-breakpoint
CREATE INDEX `events_task_idx` ON `maintenance_events` (`task_id`,`performed_on`);--> statement-breakpoint
CREATE TABLE `maintenance_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`preset_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`meter_enabled` integer DEFAULT true NOT NULL,
	`meter_interval` integer,
	`calendar_enabled` integer DEFAULT false NOT NULL,
	`calendar_value` integer,
	`calendar_unit` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_equipment_idx` ON `maintenance_tasks` (`equipment_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `meter_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`value` integer NOT NULL,
	`mode` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meter_readings_equipment_idx` ON `meter_readings` (`equipment_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `task_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`suggest_meter_interval` integer,
	`suggest_calendar_value` integer,
	`suggest_calendar_unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
