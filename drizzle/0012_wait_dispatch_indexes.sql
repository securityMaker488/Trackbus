CREATE INDEX wait_deadline ON trips(wait_until);
--> statement-breakpoint
CREATE INDEX notice_dispatch_time ON notices(category,created_at);
