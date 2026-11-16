import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { googleRoute } from "./google-routes";
import { saveWalkEstimate } from "./smart-alerts";
import { visibleProgress } from "../../packages/domain/tracking";
import { HTTPException } from "hono/http-exception";
import * as s from "../../db/schema";
import { estimateArrival, departure, type Point } from "../../packages/domain";
import { calculateRoute } from "./routing";
import { calculateLocalRoute } from "../../packages/geodata";
import type { DB } from "./access";
export type JourneyActor = {
  orgId: string;
  userId: string;
  name: string;
  role: string;
  visitor?: boolean;
};
export async function schoolRoutes(db: DB, orgId: string) {
  return db
    .select()
    .from(s.routes)
    .where(
      and(
        eq(s.routes.orgId, orgId),
        eq(s.routes.published, true),
        eq(s.routes.active, true),
        eq(s.routes.approval, "approved"),
        isNull(s.routes.archivedAt),
      ),
    )
    .limit(500);
}
export async function journeyState(db: DB, actor: JourneyActor) {
  const [org] = await db
    .select()
    .from(s.organizations)
    .where(eq(s.organizations.id, actor.orgId));
  const routes = await schoolRoutes(db, actor.orgId),
    routeIds = routes.map((r) => r.id);
  const preferences = (
    await db
      .select()
      .from(s.journeyPreferences)
      .where(
        and(
          eq(s.journeyPreferences.orgId, actor.orgId),
          eq(s.journeyPreferences.subject, actor.userId),
        ),
      )
  ).filter((x) => routeIds.includes(x.routeId));
  const selected = preferences.find((x) => x.selected),
    all = routeIds.length
      ? await db
          .select()
          .from(s.trips)
          .where(
            and(
              eq(s.trips.orgId, actor.orgId),
              inArray(s.trips.routeId, routeIds),
            ),
          )
          .orderBy(desc(s.trips.plannedStart))
          .limit(500)
      : [];
  const trips = all.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    routeId: t.routeId,
    plannedStart: t.plannedStart,
    waitUntil: t.waitUntil,
    trackingMode: t.trackingMode,
    plannedEnd: t.plannedEnd,
    currentCycle: t.currentCycle,
  }));
  const active = all.filter(
    (t) =>
      t.routeId === selected?.routeId &&
      !["completed", "cancelled"].includes(t.status),
  );
  const trip =
    active.find((t) => t.status !== "scheduled") ||
    active.sort((a, b) => a.plannedStart - b.plannedStart)[0];
  const fix = trip
    ? (
        await db
          .select()
          .from(s.locations)
          .where(
            and(
              eq(s.locations.orgId, actor.orgId),
              eq(s.locations.tripId, trip.id),
            ),
          )
      )[0]
    : null;
  const location = fix?.position ?? null;
  const eta = trip
    ? estimateArrival({
        position: location ?? null,
        itinerary: trip.snapshot,
        stopId: selected?.stopId,
        status: trip.status,
        delayUntil: trip.delayUntil,
        waitUntil: trip.waitUntil,
        now: Date.now(),
      })
    : null;
  const noticeIds = all
    .filter((t) => t.routeId === selected?.routeId)
    .map((t) => t.id);
  const notices = noticeIds.length
    ? await db
        .select({
          id: s.notices.id,
          category: s.notices.category,
          message: s.notices.message,
          simulated: s.notices.simulated,
          createdAt: s.notices.createdAt,
        })
        .from(s.notices)
        .where(
          and(
            eq(s.notices.orgId, actor.orgId),
            inArray(s.notices.tripId, noticeIds),
          ),
        )
        .orderBy(desc(s.notices.createdAt))
        .limit(40)
    : [];
  const receipts = notices.length
    ? await db
        .select({ noticeId: s.readReceipts.noticeId })
        .from(s.readReceipts)
        .where(
          and(
            eq(s.readReceipts.orgId, actor.orgId),
            eq(s.readReceipts.userId, actor.userId),
            inArray(
              s.readReceipts.noticeId,
              notices.map((n) => n.id),
            ),
          ),
        )
    : [];
  const read = new Set(receipts.map((r) => r.noticeId));
  const waiting = trip
    ? (
        await db
          .select({
            stopId: s.studentCheckins.stopId,
            expiresAt: s.studentCheckins.expiresAt,
          })
          .from(s.studentCheckins)
          .where(
            and(
              eq(s.studentCheckins.orgId, actor.orgId),
              eq(s.studentCheckins.subject, actor.userId),
              eq(s.studentCheckins.tripId, trip.id),
              eq(s.studentCheckins.cycle, trip.currentCycle),
              gt(s.studentCheckins.expiresAt, Date.now()),
            ),
          )
      )[0] || null
    : null;
  return {
    checkin: waiting,
    alerts: await db.all<{
      id: string;
      message: string;
      category: string;
      createdAt: number;
      cycle: number;
    }>(
      sql`SELECT id,message,category,created_at AS createdAt,cycle FROM journey_alerts WHERE org_id=${actor.orgId} AND subject=${actor.userId} AND route_id=${selected?.routeId || ""} AND expires_at>${Date.now()} ORDER BY created_at DESC LIMIT 30`,
    ),
    walkEstimate:
      (
        await db.all<{
          seconds: number;
          calculatedAt: number;
          validUntil: number;
          cycle: number;
        }>(
          sql`SELECT seconds,calculated_at AS calculatedAt,valid_until AS validUntil,cycle FROM walk_estimates WHERE org_id=${actor.orgId} AND subject=${actor.userId} AND trip_id=${trip?.id || ""} AND cycle=${trip?.currentCycle || 0} AND stop_id=${selected?.stopId || ""}`,
        )
      )[0] || null,
    name: actor.name,
    school: org.name,
    margin: org.safetyMargin,
    routes,
    preferences,
    trips,
    trip: trip
      ? {
          id: trip.id,
          name: trip.name,
          status: trip.status,
          snapshot: trip.snapshot,
          waitUntil: trip.waitUntil,
          currentCycle: trip.currentCycle,
        }
      : null,
    position: location || null,
    progress: visibleProgress(fix?.progress, trip?.status, Date.now()),
    eta,
    notices: notices.map((n) => ({ ...n, read: read.has(n.id) })),
    serverTime: Date.now(),
  };
}
export async function saveSelection(
  db: DB,
  actor: JourneyActor,
  choice: {
    routeId: string;
    stopId: string;
    favorite: boolean;
    notify: boolean;
  },
) {
  const route = (await schoolRoutes(db, actor.orgId)).find(
    (r) => r.id === choice.routeId,
  );
  if (!route?.stops.some((s) => s.id === choice.stopId))
    throw new HTTPException(404, {
      message: "Rota ou parada indisponível nesta escola",
    });
  const record = {
    ...choice,
    id: crypto.randomUUID(),
    orgId: actor.orgId,
    subject: actor.userId,
    selected: true,
  };
  await db.run(
    sql`DELETE FROM walk_estimates WHERE org_id=${actor.orgId} AND subject=${actor.userId} AND (route_id<>${choice.routeId} OR stop_id<>${choice.stopId} OR ${choice.notify ? 0 : 1}=1)`,
  );
  await db.batch([
    db
      .delete(s.studentCheckins)
      .where(
        and(
          eq(s.studentCheckins.orgId, actor.orgId),
          eq(s.studentCheckins.subject, actor.userId),
          sql`(${s.studentCheckins.tripId} NOT IN (SELECT id FROM trips WHERE org_id=${actor.orgId} AND route_id=${choice.routeId}) OR ${s.studentCheckins.stopId}<>${choice.stopId})`,
        ),
      ),
    db
      .update(s.journeyPreferences)
      .set({ selected: false })
      .where(
        and(
          eq(s.journeyPreferences.subject, actor.userId),
          eq(s.journeyPreferences.orgId, actor.orgId),
        ),
      ),
    db
      .insert(s.journeyPreferences)
      .values(record)
      .onConflictDoUpdate({
        target: [
          s.journeyPreferences.orgId,
          s.journeyPreferences.subject,
          s.journeyPreferences.routeId,
        ],
        set: { ...choice, selected: true },
      }),
  ]);
}
export async function walkToSelection(
  db: DB,
  actor: JourneyActor,
  position: Point,
  endpoint?: string,
  googleKey?: string,
) {
  const state = await journeyState(db, actor),
    pref = state.preferences.find((p) => p.selected);
  const route = state.routes.find((r) => r.id === pref?.routeId),
    stop = (state.trip?.snapshot.stops || route?.stops || []).find(
      (s) => s.id === pref?.stopId,
    );
  if (!stop)
    throw new HTTPException(409, {
      message: "Selecione uma rota e parada disponíveis",
    });
  const local = calculateLocalRoute([position, stop], "pedestrian");
  if (!local && !endpoint && !googleKey)
    return {
      available: false,
      reason: "Fora da cobertura caminhável ou sem conexão por vias públicas.",
    };
  try {
    const walking = googleKey
      ? await googleRoute(googleKey, [position, stop], "WALK")
      : (local ??
        (await calculateRoute(endpoint!, [position, stop], "pedestrian")));
    // Routes duration is provider content, not a permitted coordinate cache.
    // In Google mode the student may supply a separate, habitual walking time.
    if (!googleKey && state.trip?.currentCycle && pref?.notify)
      await saveWalkEstimate(db, {
        orgId: actor.orgId,
        subject: actor.userId,
        tripId: state.trip.id,
        cycle: state.trip.currentCycle,
        routeId: pref.routeId,
        stopId: pref.stopId,
        seconds: walking.seconds,
      });
    return {
      available: true,
      ...walking,
      margin: state.margin,
      calculatedAt: Date.now(),
      validUntil: Date.now() + 600000,
      recommendation: departure(
        state.eta?.minMinutes ?? null,
        walking.seconds,
        state.margin,
      ),
    };
  } catch {
    return {
      available: false,
      reason: "Não foi possível obter um percurso caminhável.",
    };
  }
}
