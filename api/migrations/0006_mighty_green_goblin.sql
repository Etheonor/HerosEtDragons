CREATE TABLE `compendium_shares` (
	`campaign_id` text NOT NULL,
	`category` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`campaign_id`, `category`, `slug`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
