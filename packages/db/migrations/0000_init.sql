CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`intervention_id` text,
	`filename` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`intervention_id`) REFERENCES `intervention`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachment_equipment_idx` ON `attachment` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text DEFAULT '' NOT NULL,
	`meter_kind` text DEFAULT 'none' NOT NULL,
	`reading` real,
	`reading_updated_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT "meter_kind_valid" CHECK("equipment"."meter_kind" IN ('none', 'hours', 'miles')),
	CONSTRAINT "reading_not_negative" CHECK("equipment"."reading" IS NULL OR "equipment"."reading" >= 0)
);
--> statement-breakpoint
CREATE TABLE `intervention` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`equipment_id` text NOT NULL,
	`label` text,
	`date` text NOT NULL,
	`meter_at` real,
	`location` text,
	`performed_by` text,
	`comments` text,
	`expiry_date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_xor_label" CHECK(("intervention"."task_id" IS NOT NULL AND "intervention"."label" IS NULL) OR ("intervention"."task_id" IS NULL AND "intervention"."label" IS NOT NULL)),
	CONSTRAINT "meter_at_not_negative" CHECK("intervention"."meter_at" IS NULL OR "intervention"."meter_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `intervention_task_idx` ON `intervention` (`task_id`);--> statement-breakpoint
CREATE INDEX `intervention_equipment_idx` ON `intervention` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `intervention_date_idx` ON `intervention` (`date`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text NOT NULL,
	`months_interval` integer,
	`meter_interval` real,
	`current_expiry_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "kind_valid" CHECK("task"."kind" IN ('interval', 'expiry')),
	CONSTRAINT "months_interval_positive" CHECK("task"."months_interval" IS NULL OR "task"."months_interval" >= 1),
	CONSTRAINT "meter_interval_positive" CHECK("task"."meter_interval" IS NULL OR "task"."meter_interval" > 0),
	CONSTRAINT "interval_has_component" CHECK("task"."kind" != 'interval' OR "task"."months_interval" IS NOT NULL OR "task"."meter_interval" IS NOT NULL),
	CONSTRAINT "expiry_has_no_intervals" CHECK("task"."kind" != 'expiry' OR ("task"."months_interval" IS NULL AND "task"."meter_interval" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `task_equipment_idx` ON `task` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `task_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`months_interval` integer,
	`meter_interval` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "months_interval_positive" CHECK("task_preset"."months_interval" IS NULL OR "task_preset"."months_interval" >= 1),
	CONSTRAINT "meter_interval_positive" CHECK("task_preset"."meter_interval" IS NULL OR "task_preset"."meter_interval" > 0)
);
