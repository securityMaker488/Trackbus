ALTER TABLE routes ADD COLUMN created_by TEXT;
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN approval TEXT NOT NULL DEFAULT 'approved' CHECK (approval IN ('draft','pending','approved','rejected'));
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN submitted_at INTEGER;
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN reviewed_at INTEGER;
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE routes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE routes SET created_by = (SELECT owner_id FROM organizations WHERE organizations.id = routes.org_id);
--> statement-breakpoint
CREATE INDEX route_review ON routes(org_id, approval);
--> statement-breakpoint
CREATE INDEX route_creator ON routes(org_id, created_by);
--> statement-breakpoint
CREATE TRIGGER route_publish_approved_insert BEFORE INSERT ON routes WHEN NEW.published = 1 AND NEW.approval != 'approved' BEGIN SELECT RAISE(ABORT, 'route_not_approved'); END;
--> statement-breakpoint
CREATE TRIGGER route_publish_approved_update BEFORE UPDATE ON routes WHEN NEW.published = 1 AND NEW.approval != 'approved' BEGIN SELECT RAISE(ABORT, 'route_not_approved'); END;
--> statement-breakpoint
ALTER TABLE access_sessions ADD COLUMN parent_id TEXT REFERENCES access_sessions(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE TRIGGER route_version_current BEFORE INSERT ON route_versions WHEN NOT EXISTS(SELECT 1 FROM routes WHERE id=NEW.route_id AND org_id=NEW.org_id AND version=NEW.version) BEGIN SELECT RAISE(ABORT, 'route_version_conflict'); END;
