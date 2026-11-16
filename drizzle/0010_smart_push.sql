ALTER TABLE push_subscriptions ADD COLUMN p256dh TEXT;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN auth TEXT;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN private_preview INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN smart INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN operational INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN approaching INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE walk_estimates (
 id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id), subject TEXT NOT NULL,
 trip_id TEXT NOT NULL REFERENCES trips(id), cycle INTEGER NOT NULL, route_id TEXT NOT NULL REFERENCES routes(id), stop_id TEXT NOT NULL,
 seconds REAL NOT NULL CHECK(seconds>=0), calculated_at INTEGER NOT NULL, valid_until INTEGER NOT NULL,
 next_check_at INTEGER NOT NULL, phase INTEGER NOT NULL DEFAULT 0,
 UNIQUE(org_id,subject)
);
--> statement-breakpoint
CREATE INDEX walk_due ON walk_estimates(next_check_at,trip_id);
--> statement-breakpoint
CREATE TABLE journey_alerts (
 id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id), subject TEXT NOT NULL,
 trip_id TEXT NOT NULL REFERENCES trips(id), cycle INTEGER NOT NULL, route_id TEXT NOT NULL, stop_id TEXT NOT NULL,
 category TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX journey_alert_subject ON journey_alerts(org_id,subject,created_at);
--> statement-breakpoint
CREATE TABLE push_deliveries (
 id TEXT PRIMARY KEY NOT NULL, sub_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 org_id TEXT NOT NULL REFERENCES organizations(id), trip_id TEXT NOT NULL REFERENCES trips(id), cycle INTEGER NOT NULL,
 route_id TEXT NOT NULL, stop_id TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL, result TEXT, sent_at INTEGER
);
--> statement-breakpoint
CREATE INDEX push_delivery_due ON push_deliveries(status,next_at);
--> statement-breakpoint
CREATE INDEX push_delivery_expiry ON push_deliveries(expires_at);
--> statement-breakpoint
CREATE TRIGGER cycle_reset_estimates AFTER UPDATE OF current_cycle ON trips
 WHEN OLD.current_cycle<>NEW.current_cycle
 BEGIN
 DELETE FROM walk_estimates WHERE trip_id=NEW.id;
 UPDATE push_deliveries SET status='cancelled',result='cycle_changed' WHERE trip_id=NEW.id AND cycle<>NEW.current_cycle AND status IN ('pending','sending');
 END;
--> statement-breakpoint
CREATE TRIGGER trip_end_estimates AFTER UPDATE OF status ON trips
 WHEN NEW.status IN ('completed','cancelled')
 BEGIN
 DELETE FROM walk_estimates WHERE trip_id=NEW.id;
 UPDATE push_deliveries SET status='cancelled',result='trip_ended' WHERE trip_id=NEW.id AND category IN ('prepare','leave','late','approaching','refresh','passed') AND status IN ('pending','sending');
 END;
