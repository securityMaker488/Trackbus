ALTER TABLE routes ADD COLUMN distance_meters REAL CHECK(distance_meters IS NULL OR distance_meters >= 0);
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN geometry_source TEXT NOT NULL DEFAULT 'unknown';
