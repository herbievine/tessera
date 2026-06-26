PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_integrations` (
	`id` text PRIMARY KEY,
	`vendor` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`external_user_id` text,
	`scope` text,
	`expires_at` integer,
	`garmin_email` text,
	`garmin_password` text,
	`user_id` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_integrations`(`id`, `vendor`, `access_token`, `refresh_token`, `external_user_id`, `scope`, `expires_at`, `garmin_email`, `garmin_password`, `user_id`, `created_at`) SELECT `id`, `vendor`, `access_token`, `refresh_token`, `external_user_id`, `scope`, `expires_at`, `garmin_email`, `garmin_password`, `user_id`, `created_at` FROM `integrations`;--> statement-breakpoint
DROP TABLE `integrations`;--> statement-breakpoint
ALTER TABLE `__new_integrations` RENAME TO `integrations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
