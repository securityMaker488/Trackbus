CREATE TABLE `absences` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`shift` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `absence_date` ON `absences` (`student_id`,`date`,`shift`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_time` ON `audit_logs` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `boarding` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`student_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boarding_once` ON `boarding` (`trip_id`,`student_id`,`kind`);--> statement-breakpoint
CREATE TABLE `calendar` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`suspended` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_date` ON `calendar` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`role` text NOT NULL,
	`actor_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `demo_expiry` ON `demo_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `driver_org` ON `drivers` (`org_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`route_id` text,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expense_org_date` ON `expenses` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `guardian_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guardian_student` ON `guardian_links` (`student_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `guardian_user` ON `guardian_links` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`resolution` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`actor_id` text NOT NULL,
	`simulated` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `incident_org` ON `incidents` (`org_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`position` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_trip_id_unique` ON `locations` (`trip_id`);--> statement-breakpoint
CREATE TABLE `maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `maintenance_org` ON `maintenance` (`org_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `membership_org` ON `memberships` (`org_id`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`actor_id` text NOT NULL,
	`simulated` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notice_org_time` ON `notices` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`demo` integer DEFAULT true NOT NULL,
	`max_wait` integer DEFAULT 300 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_owner_id_unique` ON `organizations` (`owner_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_expiry` ON `rate_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `read_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notice_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notice_id`) REFERENCES `notices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notice_read` ON `read_receipts` (`notice_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `route_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`route_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `route_version` ON `route_versions` (`route_id`,`version`);--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`shift` text NOT NULL,
	`stops` text NOT NULL,
	`geometry` text NOT NULL,
	`routed` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `route_org` ON `routes` (`org_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`enrollment` text NOT NULL,
	`class_name` text NOT NULL,
	`shift` text NOT NULL,
	`route_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_enrollment` ON `students` (`org_id`,`enrollment`);--> statement-breakpoint
CREATE INDEX `student_user` ON `students` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `trip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`actor_id` text NOT NULL,
	`simulated` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_org_time` ON `trip_events` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`route_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`monitor_id` text,
	`planned_start` integer NOT NULL,
	`planned_end` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`snapshot` text NOT NULL,
	`delay_until` integer,
	`wait_until` integer,
	`wait_stop_id` text,
	`sim_progress` real DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trip_org_time` ON `trips` (`org_id`,`planned_start`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`plate` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`capacity` integer NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_plate` ON `vehicles` (`org_id`,`plate`);