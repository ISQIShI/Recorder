ALTER TABLE `records_entries` ADD COLUMN `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `records_owner_state_time` ON `records_entries` (`owner_id`,`deleted_at`,`created_at`,`id`);
