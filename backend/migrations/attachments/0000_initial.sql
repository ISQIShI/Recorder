CREATE TABLE `attachments_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`record_id` text,
	`object_id` text NOT NULL,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`state` text NOT NULL,
	`bytes` integer,
	`digest` text,
	`created_at` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`owner_id`) REFERENCES `identity_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`record_id`) REFERENCES `records_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_objects_object_id_unique` ON `attachments_objects` (`object_id`);--> statement-breakpoint
CREATE INDEX `attachments_record` ON `attachments_objects` (`owner_id`,`record_id`);