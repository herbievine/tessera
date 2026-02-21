DELETE FROM `observations`;
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_observations` (
	`id` text PRIMARY KEY,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`unit` text,
	`value` real NOT NULL,
	`observed_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`created_at` integer,
	CONSTRAINT `observations_user_id_observed_at_type_source_unique` UNIQUE(`user_id`,`observed_at`,`type`,`source`)
);
--> statement-breakpoint
INSERT INTO `__new_observations`(`id`, `source`, `type`, `label`, `unit`, `value`, `observed_at`, `user_id`, `integration_id`, `created_at`) SELECT `id`, `source`, `type`, `label`, `unit`, `value`, `observed_at`, `user_id`, `integration_id`, `created_at` FROM `observations`;--> statement-breakpoint
DROP TABLE `observations`;--> statement-breakpoint
ALTER TABLE `__new_observations` RENAME TO `observations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_date_source_type` ON `observations` (`user_id`,`observed_at`,`source`,`type`);
