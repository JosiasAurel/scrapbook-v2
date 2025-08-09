ALTER TABLE `updates_table` RENAME TO `updates`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`postTime` integer NOT NULL,
	`text` text NOT NULL,
	`attachments` text,
	`source` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_updates`("id", "postTime", "text", "attachments", "source", "user_id") SELECT "id", "postTime", "text", "attachments", "source", "user_id" FROM `updates`;--> statement-breakpoint
DROP TABLE `updates`;--> statement-breakpoint
ALTER TABLE `__new_updates` RENAME TO `updates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`updateId` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`reactionTime` integer NOT NULL,
	FOREIGN KEY (`updateId`) REFERENCES `updates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("id", "updateId", "user_id", "reaction", "reactionTime") SELECT "id", "updateId", "user_id", "reaction", "reactionTime" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;