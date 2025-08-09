CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`updateId` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`reactionTime` integer NOT NULL,
	FOREIGN KEY (`updateId`) REFERENCES `updates_table`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_updates_table` (
	`id` text PRIMARY KEY NOT NULL,
	`postTime` integer NOT NULL,
	`text` text NOT NULL,
	`attachments` text,
	`source` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_updates_table`("id", "postTime", "text", "attachments", "source", "user_id") SELECT "id", "postTime", "text", "attachments", "source", "user_id" FROM `updates_table`;--> statement-breakpoint
DROP TABLE `updates_table`;--> statement-breakpoint
ALTER TABLE `__new_updates_table` RENAME TO `updates_table`;--> statement-breakpoint
PRAGMA foreign_keys=ON;