ALTER TABLE `activity_details` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_details` ADD `power_zones` text;--> statement-breakpoint
ALTER TABLE `activity_details` ADD `exercise_sets` text;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `moving_duration_s`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `elapsed_duration_s`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `elevation_gain_m`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `elevation_loss_m`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `average_speed_mps`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `max_speed_mps`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `calories`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `average_hr`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `max_hr`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `average_cadence`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `max_cadence`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `steps`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `avg_stride_length_cm`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `vo2_max`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `aerobic_training_effect`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `anaerobic_training_effect`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `training_effect_label`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `location_name`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `start_latitude`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `start_longitude`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `has_polyline`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `lap_count`;