CREATE TABLE `categories_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `identity_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `categories_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_parent_name` ON `categories_nodes` (`owner_id`,`parent_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_root_name` ON `categories_nodes` (`owner_id`,`name`) WHERE "categories_nodes"."parent_id" is null;--> statement-breakpoint
CREATE TABLE `categories_record_links` (
	`record_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`record_id`, `category_id`),
	FOREIGN KEY (`record_id`) REFERENCES `records_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categories_link_category` ON `categories_record_links` (`category_id`,`record_id`);