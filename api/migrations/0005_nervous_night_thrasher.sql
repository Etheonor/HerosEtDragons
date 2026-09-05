CREATE TABLE `compendium_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`source` text DEFAULT 'DRS' NOT NULL,
	`source_page` integer,
	`meta` text,
	`body` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`origin` text DEFAULT 'drs' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`hash` text NOT NULL,
	`ingest_commit` text,
	`campaign_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `compendium_category_idx` ON `compendium_entries` (`category`);