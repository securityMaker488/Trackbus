import { sql } from "drizzle-orm";
import type { DB } from "./access";
/** Bounded SQL cleanup: do not parse whole geometries in Worker CPU. */
export async function expireGoogleGeometry(db: DB, now = Date.now()) {
  await db.run(sql`UPDATE routes SET
    geometry=(SELECT json_group_array(json_array(json_extract(value,'$.lng'),json_extract(value,'$.lat'))) FROM json_each(routes.stops)),
    routed=0,geometry_source='google-expired',geometry_expires_at=NULL,distance_meters=NULL
    WHERE id IN (SELECT id FROM routes WHERE geometry_source='google' AND geometry_expires_at<=${now} LIMIT 20)`);
  await db.run(sql`UPDATE trips SET snapshot=json_set(snapshot,
    '$.geometry',json((SELECT json_group_array(json_array(json_extract(value,'$.lng'),json_extract(value,'$.lat'))) FROM json_each(trips.snapshot,'$.stops'))),
    '$.routed',json('false'),'$.geometrySource','google-expired','$.geometryExpiresAt',NULL)
    WHERE id IN (SELECT id FROM trips WHERE json_extract(snapshot,'$.geometryExpiresAt')<=${now} LIMIT 20)`);
  await db.run(sql`UPDATE route_versions SET snapshot=json_set(snapshot,
    '$.geometry',json((SELECT json_group_array(json_array(json_extract(value,'$.lng'),json_extract(value,'$.lat'))) FROM json_each(route_versions.snapshot,'$.stops'))),
    '$.routed',json('false'),'$.geometrySource','google-expired','$.geometryExpiresAt',NULL)
    WHERE id IN (SELECT id FROM route_versions WHERE json_extract(snapshot,'$.geometryExpiresAt')<=${now} LIMIT 20)`);
}
