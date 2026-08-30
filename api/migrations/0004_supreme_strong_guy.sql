CREATE TABLE `npc_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`ca` integer DEFAULT 10 NOT NULL,
	`pv_max` integer DEFAULT 1 NOT NULL,
	`init_bonus` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#C0392B' NOT NULL,
	`conditions` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `npc_templates_campaign_idx` ON `npc_templates` (`campaign_id`);