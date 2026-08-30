CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`target_type` text DEFAULT 'map' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_campaign_idx` ON `notes` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_target_idx` ON `notes` (`campaign_id`,`target_type`,`target_id`);