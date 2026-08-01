CREATE TABLE `activities` (
	`id` text PRIMARY KEY,
	`garmin_activity_id` text NOT NULL,
	`name` text,
	`type_key` text NOT NULL,
	`start_time_local` integer NOT NULL,
	`start_time_gmt` integer NOT NULL,
	`distance_m` real,
	`duration_s` real,
	`moving_duration_s` real,
	`elapsed_duration_s` real,
	`elevation_gain_m` real,
	`elevation_loss_m` real,
	`average_speed_mps` real,
	`max_speed_mps` real,
	`calories` real,
	`average_hr` real,
	`max_hr` real,
	`average_cadence` real,
	`max_cadence` real,
	`steps` integer,
	`avg_stride_length_cm` real,
	`vo2_max` real,
	`aerobic_training_effect` real,
	`anaerobic_training_effect` real,
	`training_effect_label` text,
	`location_name` text,
	`start_latitude` real,
	`start_longitude` real,
	`has_polyline` integer,
	`lap_count` integer,
	`user_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`created_at` integer,
	CONSTRAINT `activities_user_id_garmin_activity_id_unique` UNIQUE(`user_id`,`garmin_activity_id`)
);
--> statement-breakpoint
CREATE TABLE `activity_details` (
	`activity_id` text PRIMARY KEY,
	`point_count` integer,
	`route` text,
	`series` text,
	`splits` text,
	`weather` text,
	`hr_zones` text,
	`fetched_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_activities_user_start` ON `activities` (`user_id`,`start_time_gmt`);--> statement-breakpoint
CREATE INDEX `idx_activities_user_type_start` ON `activities` (`user_id`,`type_key`,`start_time_gmt`);