ALTER TABLE journey_preferences ADD COLUMN next_alert_check_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX journey_alert_due ON journey_preferences(selected,notify,next_alert_check_at);
