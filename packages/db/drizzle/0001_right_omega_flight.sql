CREATE TABLE `fuel_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`logged_at` text NOT NULL,
	`odometer` integer NOT NULL,
	`gallons_hundredths` integer NOT NULL,
	`price_per_gallon_cents` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fuel_logs_equipment_idx` ON `fuel_logs` (`equipment_id`,`logged_at`);