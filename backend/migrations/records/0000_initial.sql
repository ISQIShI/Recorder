CREATE TABLE `records_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`format` text NOT NULL,
	`format_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`origin_instance_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `identity_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_request` ON `records_entries` (`owner_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `records_owner_time` ON `records_entries` (`owner_id`,`created_at`,`id`);