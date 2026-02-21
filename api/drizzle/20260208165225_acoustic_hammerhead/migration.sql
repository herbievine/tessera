CREATE TABLE `integrations` (
	`id` text PRIMARY KEY,
	`vendor` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`external_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer
);
