export { queueNotice as deliver, validEndpoint } from "./push";
// Expiry is reconciled on the next authorized read. Conditional inserts and the
// clearing update share a transaction, so concurrent polls record one ending.
export async function expireWaits(DB: D1Database, org: string, limit = 2) {
  const now = Date.now(),
    due = await DB.prepare(
      "SELECT id,wait_until FROM trips WHERE org_id=? AND wait_until IS NOT NULL AND wait_until<=? ORDER BY wait_until LIMIT ?",
    )
      .bind(org, now, Math.min(2, Math.max(1, limit)))
      .all<{ id: string; wait_until: number }>();
  for (const t of due.results) {
    const match = " FROM trips WHERE id=? AND org_id=? AND wait_until=?";
    const eventId = t.id + ":wait-end:" + t.wait_until;
    await DB.batch([
      DB.prepare(
        "INSERT OR IGNORE INTO trip_events (id,org_id,actor_id,trip_id,type,message,simulated,created_at) SELECT ?,org_id,'trackbus',id,'wait_ended','Prazo de espera encerrado',tracking_mode='simulation',?" +
          match,
      ).bind(eventId, t.wait_until, t.id, org, t.wait_until),
      DB.prepare(
        "INSERT OR IGNORE INTO notices (id,org_id,actor_id,trip_id,category,message,simulated,created_at) SELECT ?,org_id,'trackbus',id,'wait_ended','Prazo de espera encerrado',tracking_mode='simulation',?" +
          match,
      ).bind(eventId, t.wait_until, t.id, org, t.wait_until),
      DB.prepare(
        "UPDATE trips SET wait_until=NULL,wait_stop_id=NULL,revision=revision+1 WHERE id=? AND org_id=? AND wait_until=?",
      ).bind(t.id, org, t.wait_until),
    ]);
  }
}
