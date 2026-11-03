CREATE TRIGGER trip_schedule_insert BEFORE INSERT ON trips
WHEN NEW.status NOT IN ('completed','cancelled') AND EXISTS (
 SELECT 1 FROM trips t WHERE t.org_id=NEW.org_id AND t.status NOT IN ('completed','cancelled')
 AND (t.vehicle_id=NEW.vehicle_id OR t.driver_id=NEW.driver_id)
 AND NEW.planned_start < t.planned_end AND t.planned_start < NEW.planned_end
) BEGIN SELECT RAISE(ABORT, 'trip_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER trip_schedule_update BEFORE UPDATE ON trips
WHEN NEW.status NOT IN ('completed','cancelled') AND EXISTS (
 SELECT 1 FROM trips t WHERE t.id<>NEW.id AND t.org_id=NEW.org_id AND t.status NOT IN ('completed','cancelled')
 AND (t.vehicle_id=NEW.vehicle_id OR t.driver_id=NEW.driver_id)
 AND ((NEW.planned_start < t.planned_end AND t.planned_start < NEW.planned_end)
 OR (NEW.status IN ('in_progress','paused','interrupted') AND t.status IN ('in_progress','paused','interrupted')))
) BEGIN SELECT RAISE(ABORT, 'active_conflict'); END;
