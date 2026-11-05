CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subject` text NOT NULL,
	`endpoint` text NOT NULL,
	`expires` integer NOT NULL,
	`last_notice` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_org_subject` ON `push_subscriptions` (`org_id`,`subject`);