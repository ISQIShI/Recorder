CREATE TABLE `core_instance` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_instance_slot_unique` ON `core_instance` (`slot`);--> statement-breakpoint
CREATE TABLE `identity_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`channel` text NOT NULL,
	`client_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `identity_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_sessions_token_hash_unique` ON `identity_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `identity_sessions_user` ON `identity_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `identity_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`owner_slot` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_users_username_unique` ON `identity_users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_users_owner_slot_unique` ON `identity_users` (`owner_slot`);