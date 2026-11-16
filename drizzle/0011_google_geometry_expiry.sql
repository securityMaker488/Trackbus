ALTER TABLE routes ADD COLUMN geometry_expires_at INTEGER;
--> statement-breakpoint
CREATE INDEX route_geometry_expiry ON routes(geometry_expires_at);
--> statement-breakpoint
CREATE INDEX trip_geometry_expiry ON trips(json_extract(snapshot,'$.geometryExpiresAt'));
--> statement-breakpoint
CREATE INDEX version_geometry_expiry ON route_versions(json_extract(snapshot,'$.geometryExpiresAt'));
