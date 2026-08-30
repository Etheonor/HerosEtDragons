CREATE TABLE `journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`who` text,
	`who_color` text,
	`text` text NOT NULL,
	`roll` text,
	`ref` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_campaign_idx` ON `journal` (`campaign_id`);