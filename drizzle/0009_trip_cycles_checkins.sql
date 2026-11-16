ALTER TABLE trips ADD COLUMN current_cycle INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN cycle_started_at INTEGER;
--> statement-breakpoint
CREATE TABLE trip_cycles (
 id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id),
 trip_id TEXT NOT NULL REFERENCES trips(id), number INTEGER NOT NULL CHECK(number>0),
 started_at INTEGER NOT NULL, ended_at INTEGER, ended_reason TEXT,
 UNIQUE(trip_id,number)
);
--> statement-breakpoint
CREATE INDEX cycle_org_trip ON trip_cycles(org_id,trip_id,number);
--> statement-breakpoint
UPDATE trips SET current_cycle=1,cycle_started_at=started_at WHERE started_at IS NOT NULL;
--> statement-breakpoint
INSERT INTO trip_cycles(id,org_id,trip_id,number,started_at,ended_at,ended_reason)
 SELECT id||':1',org_id,id,1,started_at,ended_at,CASE WHEN ended_at IS NOT NULL THEN status ELSE NULL END FROM trips WHERE started_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE locations ADD COLUMN cycle INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE student_checkins (
 id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id), subject TEXT NOT NULL,
 trip_id TEXT NOT NULL REFERENCES trips(id), cycle INTEGER NOT NULL CHECK(cycle>0), stop_id TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 UNIQUE(org_id,subject)
);
--> statement-breakpoint
CREATE INDEX checkin_trip_cycle_stop ON student_checkins(org_id,trip_id,cycle,stop_id,expires_at);
--> statement-breakpoint
CREATE INDEX checkin_expiry ON student_checkins(expires_at);
--> statement-breakpoint
CREATE TRIGGER trip_first_cycle AFTER UPDATE OF started_at ON trips
 WHEN OLD.started_at IS NULL AND NEW.started_at IS NOT NULL AND NEW.current_cycle=0
 BEGIN
 UPDATE trips SET current_cycle=1,cycle_started_at=NEW.started_at WHERE id=NEW.id;
 INSERT INTO trip_cycles(id,org_id,trip_id,number,started_at) VALUES(NEW.id||':1',NEW.org_id,NEW.id,1,NEW.started_at);
 END;
--> statement-breakpoint
CREATE TRIGGER trip_insert_cycle AFTER INSERT ON trips
 WHEN NEW.started_at IS NOT NULL AND NEW.current_cycle=0
 BEGIN
 UPDATE trips SET current_cycle=1,cycle_started_at=NEW.started_at WHERE id=NEW.id;
 INSERT INTO trip_cycles(id,org_id,trip_id,number,started_at,ended_at,ended_reason) VALUES(NEW.id||':1',NEW.org_id,NEW.id,1,NEW.started_at,NEW.ended_at,CASE WHEN NEW.ended_at IS NOT NULL THEN NEW.status ELSE NULL END);
 END;
--> statement-breakpoint
CREATE TRIGGER trip_next_cycle AFTER UPDATE OF current_cycle ON trips
 WHEN OLD.current_cycle>0 AND NEW.current_cycle=OLD.current_cycle+1
 BEGIN
 UPDATE trip_cycles SET ended_at=NEW.cycle_started_at,ended_reason='next_cycle' WHERE trip_id=NEW.id AND number=OLD.current_cycle AND ended_at IS NULL;
 INSERT INTO trip_cycles(id,org_id,trip_id,number,started_at) VALUES(NEW.id||':'||NEW.current_cycle,NEW.org_id,NEW.id,NEW.current_cycle,NEW.cycle_started_at);
 DELETE FROM locations WHERE trip_id=NEW.id;
 DELETE FROM student_checkins WHERE trip_id=NEW.id;
 END;
--> statement-breakpoint
CREATE TRIGGER trip_end_cycle AFTER UPDATE OF status ON trips
 WHEN NEW.status IN ('completed','cancelled')
 BEGIN
 UPDATE trip_cycles SET ended_at=NEW.ended_at,ended_reason=NEW.status WHERE trip_id=NEW.id AND ended_at IS NULL;
 DELETE FROM student_checkins WHERE trip_id=NEW.id;
 END;
--> statement-breakpoint
CREATE TRIGGER location_cycle_insert BEFORE INSERT ON locations
 WHEN NOT EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND current_cycle=NEW.cycle AND status IN ('in_progress','paused','interrupted') AND json_extract(NEW.position,'$.timestamp')>=cycle_started_at-CASE WHEN current_cycle=1 THEN 60000 ELSE 0 END)
 BEGIN SELECT RAISE(ABORT,'location_cycle_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER location_cycle_update BEFORE UPDATE ON locations
 WHEN NOT EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND current_cycle=NEW.cycle AND status IN ('in_progress','paused','interrupted') AND json_extract(NEW.position,'$.timestamp')>=cycle_started_at-CASE WHEN current_cycle=1 THEN 60000 ELSE 0 END)
 BEGIN SELECT RAISE(ABORT,'location_cycle_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER checkin_cycle_insert BEFORE INSERT ON student_checkins
 WHEN NOT EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND current_cycle=NEW.cycle AND status IN ('in_progress','paused','interrupted'))
 BEGIN SELECT RAISE(ABORT,'checkin_cycle_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER checkin_cycle_update BEFORE UPDATE ON student_checkins
 WHEN NOT EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND org_id=NEW.org_id AND current_cycle=NEW.cycle AND status IN ('in_progress','paused','interrupted'))
 BEGIN SELECT RAISE(ABORT,'checkin_cycle_conflict'); END;
