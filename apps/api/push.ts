import { buildPushPayload } from "@block65/webcrypto-web-push";
import { sql, and, eq, gt } from "drizzle-orm";
import * as s from "../../db/schema";
import type { DB } from "./access";
export type PushEnv = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
};
export function validEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function validPushKeys(keys: { p256dh: string; auth: string }) {
  try {
    const point = Buffer.from(keys.p256dh, "base64url"),
      secret = Buffer.from(keys.auth, "base64url");
    if (point.length !== 65 || point[0] !== 4 || secret.length !== 16)
      return false;
    await crypto.subtle.importKey(
      "raw",
      point,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return true;
  } catch {
    return false;
  }
}
export async function pushRequest(
  sub: { endpoint: string; p256dh: string; auth: string },
  env: PushEnv,
  payload: unknown,
) {
  if (!validEndpoint(sub.endpoint)) throw Error("Endpoint não permitido");
  const privateKey = JSON.parse(env.VAPID_PRIVATE_JWK || "{}").d;
  if (!privateKey || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT)
    throw Error("Push não configurado");
  return buildPushPayload(
    { data: JSON.stringify(payload), options: { ttl: 120 } },
    {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey },
  );
}
type Delivery = {
  id: string;
  sub_id: string;
  org_id: string;
  trip_id: string;
  cycle: number;
  route_id: string;
  stop_id: string;
  category: string;
  body: string;
  expires_at: number;
  attempts: number;
};
export async function queueForStudent(
  db: DB,
  input: {
    id: string;
    orgId: string;
    subject: string;
    tripId: string;
    cycle: number;
    routeId: string;
    stopId: string;
    category: string;
    message: string;
    expires: number;
  },
  now = Date.now(),
) {
  const smart = ["prepare", "leave", "late", "refresh", "passed"].includes(
    input.category,
  );
  const preference = smart
    ? sql`AND smart=1`
    : input.category === "approaching"
      ? sql`AND approaching=1`
      : sql`AND operational=1`;
  await db.run(sql`INSERT OR IGNORE INTO push_deliveries(id,sub_id,org_id,trip_id,cycle,route_id,stop_id,category,body,created_at,expires_at,next_at)
    SELECT ${input.id}||':'||id,id,org_id,${input.tripId},${input.cycle},${input.routeId},${input.stopId},${input.category},${input.message},${now},${input.expires},${now}
    FROM push_subscriptions WHERE org_id=${input.orgId} AND subject=${input.subject} AND expires>${now} AND p256dh IS NOT NULL AND auth IS NOT NULL ${preference}`);
}
export async function queueNotice(
  db: DB,
  env: PushEnv,
  trip: typeof s.trips.$inferSelect,
  id: string,
  flush = false,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return;
  // The event ID makes insertion idempotent, including concurrent retries.
  await db.run(sql`INSERT OR IGNORE INTO push_deliveries(id,sub_id,org_id,trip_id,cycle,route_id,stop_id,category,body,created_at,expires_at,next_at)
    SELECT ${id}||':'||ps.id,ps.id,t.org_id,t.id,t.current_cycle,t.route_id,jp.stop_id,n.category,n.message,${Date.now()},${Date.now() + 120000},${Date.now()}
    FROM trips t JOIN routes r ON r.id=t.route_id AND r.org_id=t.org_id
    JOIN notices n ON n.id=${id} AND n.trip_id=t.id AND n.org_id=t.org_id
    JOIN journey_preferences jp ON jp.route_id=r.id AND jp.org_id=r.org_id AND jp.selected=1 AND jp.notify=1
    JOIN push_subscriptions ps ON ps.org_id=jp.org_id AND ps.subject=jp.subject
    WHERE t.id=${trip.id} AND t.org_id=${trip.orgId} AND r.active=1 AND r.published=1 AND r.approval='approved'
    AND n.created_at>=COALESCE(t.cycle_started_at,0) AND ps.expires>${Date.now()} AND ps.p256dh IS NOT NULL AND ps.auth IS NOT NULL AND ps.operational=1`);
  if (flush) await flushPush(db, env);
}
export async function flushPush(
  db: DB,
  env: PushEnv,
  now = Date.now(),
  send: typeof fetch = fetch,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT)
    return;
  const due = await db.all<Delivery>(
    sql`SELECT * FROM push_deliveries WHERE status IN ('pending','sending') AND next_at<=${now} AND expires_at>${now} AND attempts<4 ORDER BY next_at LIMIT 4`,
  );
  for (let i = 0; i < due.length; i += 5)
    await Promise.all(
      due.slice(i, i + 5).map(async (d) => {
        const claim = await db.run(
          sql`UPDATE push_deliveries SET status='sending',attempts=attempts+1,next_at=${now + 60000} WHERE id=${d.id} AND status IN ('pending','sending') AND next_at<=${now} AND attempts=${d.attempts}`,
        );
        if (!claim.meta.changes) return;
        const [sub] = await db
          .select()
          .from(s.pushSubscriptions)
          .where(
            and(
              eq(s.pushSubscriptions.id, d.sub_id),
              eq(s.pushSubscriptions.orgId, d.org_id),
              gt(s.pushSubscriptions.expires, now),
            ),
          );
        const requiresActive = [
          "prepare",
          "leave",
          "late",
          "refresh",
          "passed",
          "approaching",
        ].includes(d.category);
        const requiresFreshGps = requiresActive && d.category !== "refresh";
        const allowed =
          sub &&
          (
            await db.all(sql`SELECT 1 FROM trips t JOIN routes r ON r.id=t.route_id AND r.org_id=t.org_id JOIN journey_preferences p ON p.org_id=t.org_id AND p.route_id=r.id
      LEFT JOIN locations l ON l.trip_id=t.id AND l.org_id=t.org_id AND l.cycle=t.current_cycle
      WHERE t.id=${d.trip_id} AND t.org_id=${d.org_id} AND t.current_cycle=${d.cycle} AND r.published=1 AND r.active=1 AND r.approval='approved' AND p.subject=${sub.subject} AND p.selected=1 AND p.notify=1 AND p.stop_id=${d.stop_id}
      AND (${requiresActive ? 1 : 0}=0 OR t.status IN ('in_progress','paused','interrupted'))
      AND (${requiresFreshGps ? 1 : 0}=0 OR json_extract(l.position,'$.timestamp')>=${now - 60000})
      AND (EXISTS(SELECT 1 FROM memberships WHERE org_id=t.org_id AND user_id=p.subject AND active=1 AND role='student')
       OR EXISTS(SELECT 1 FROM access_sessions a JOIN organizations o ON o.id=a.org_id WHERE a.org_id=t.org_id AND a.subject=p.subject AND a.kind='visitor' AND a.expires>${now} AND o.demo=1 AND o.room_open=1)
       OR EXISTS(SELECT 1 FROM demo_sessions WHERE org_id=t.org_id AND actor_id=p.subject AND role='student' AND expires>${now}))`)
          ).length;
        const enabled =
          sub &&
          (["prepare", "leave", "late", "refresh", "passed"].includes(
            d.category,
          )
            ? sub.smart
            : d.category === "approaching"
              ? sub.approaching
              : sub.operational);
        if (
          !sub?.p256dh ||
          !sub.auth ||
          !allowed ||
          !enabled ||
          !validEndpoint(sub.endpoint)
        ) {
          await db.run(
            sql`UPDATE push_deliveries SET status='cancelled',result='access_or_selection_changed' WHERE id=${d.id}`,
          );
          return;
        }
        try {
          const details = await pushRequest(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            env,
            {
              title: "TrackBus · Sua viagem",
              body: sub.privatePreview
                ? "Há uma atualização na sua viagem. Abra o TrackBus para conferir."
                : d.body,
              tag: d.id,
              path:
                "/#/map?trip=" +
                encodeURIComponent(d.trip_id) +
                "&cycle=" +
                d.cycle +
                "&stop=" +
                encodeURIComponent(d.stop_id),
              expires: d.expires_at,
            },
          );
          const result = await send(sub.endpoint, {
            ...details,
            redirect: "manual",
            signal: AbortSignal.timeout(3500),
          });
          if (result.status === 404 || result.status === 410) {
            await db
              .delete(s.pushSubscriptions)
              .where(eq(s.pushSubscriptions.id, sub.id));
            return;
          }
          const success = result.status >= 200 && result.status < 300,
            retry = result.status === 429 || result.status >= 500;
          await db.run(
            sql`UPDATE push_deliveries SET status=${success ? "sent" : retry && d.attempts < 3 ? "pending" : "failed"},result=${"http_" + result.status},sent_at=${success ? now : null},next_at=${now + Math.min(60000, 15000 * 2 ** d.attempts)} WHERE id=${d.id}`,
          );
        } catch {
          await db.run(
            sql`UPDATE push_deliveries SET status=${d.attempts < 3 ? "pending" : "failed"},result='network_or_crypto_error',next_at=${now + Math.min(60000, 15000 * 2 ** d.attempts)} WHERE id=${d.id}`,
          );
        }
      }),
    );
}
