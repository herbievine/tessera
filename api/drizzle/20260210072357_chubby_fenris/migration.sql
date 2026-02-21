CREATE TABLE `observations` (
	`id` text PRIMARY KEY,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`unit` text,
	`observed_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`created_at` integer
);
