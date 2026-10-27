CREATE TABLE `tags_record_links` (
	`record_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`record_id`, `tag_id`),
	FOREIGN KEY (`record_id`) REFERENCES `records_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags_dictionary`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_link_tag` ON `tags_record_links` (`tag_id`,`record_id`);--> statement-breakpoint
CREATE TABLE `tags_dictionary` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `identity_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name` ON `tags_dictionary` (`owner_id`,`name`);