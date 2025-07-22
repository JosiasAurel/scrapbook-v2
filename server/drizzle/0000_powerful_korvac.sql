CREATE TABLE `accounts_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`streakCount` integer NOT NULL,
	`timezone` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `updates_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postTime` integer NOT NULL,
	`text` text NOT NULL,
	`attachments` text,
	`source` text NOT NULL
);
