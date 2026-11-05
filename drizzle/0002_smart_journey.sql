CREATE TABLE `access_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subject` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `access_expiry` ON `access_sessions` (`expires`);--> statement-breakpoint
CREATE INDEX `access_org_subject` ON `access_sessions` (`org_id`,`subject`);--> statement-breakpoint
CREATE TABLE `journey_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subject` text NOT NULL,
	`route_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`favorite` integer NOT NULL,
	`selected` integer NOT NULL,
	`notify` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_subject_route` ON `journey_preferences` (`org_id`,`subject`,`route_id`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `room_open` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `safety_margin` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `routes` ADD `published` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `tracking_mode` text DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
CREATE TRIGGER trackbus_location_insert BEFORE INSERT ON locations WHEN NOT EXISTS (SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND status IN ('in_progress','paused','interrupted') AND (tracking_mode='unassigned' OR tracking_mode=json_extract(NEW.position,'$.source'))) BEGIN SELECT RAISE(ABORT,'telemetry_scope'); END;
--> statement-breakpoint
CREATE TRIGGER trackbus_location_update BEFORE UPDATE OF position ON locations WHEN json_extract(OLD.position,'$.source')<>json_extract(NEW.position,'$.source') OR NOT EXISTS (SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND status IN ('in_progress','paused','interrupted')) BEGIN SELECT RAISE(ABORT,'telemetry_scope'); END;
