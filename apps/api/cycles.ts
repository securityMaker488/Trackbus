import { and, eq, gt, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { DB } from "./access";
import type { JourneyActor } from "./journey";
import * as s from "../../db/schema";
import { distance, project } from "../../packages/domain";
type Trip = typeof s.trips.$inferSelect;
function conflict(message: string): never {
  throw new HTTPException(409, { message });
}
export async function nextCycle(
  db: DB,
  trip: Trip,
  expectedCycle: number,
  now = Date.now(),
) {
  if (
    trip.currentCycle !== expectedCycle ||
    trip.status !== "in_progress" ||
    !trip.currentCycle
  )
    conflict(
      "A volta mudou ou a viagem não está em andamento. Atualize a tela.",
    );
  if (now >= trip.plannedEnd)
    conflict(
      "O horário do serviço terminou. Finalize a volta atual e encerre a viagem.",
    );
  if (trip.waitUntil && trip.waitUntil > now)
    conflict("Encerre a espera antes de iniciar outra volta.");
  const [fix] = await db
    .select()
    .from(s.locations)
    .where(
      and(eq(s.locations.tripId, trip.id), eq(s.locations.orgId, trip.orgId)),
    );
  const total = project(trip.snapshot.stops[0], trip.snapshot.geometry).total;
  if (trip.trackingMode === "simulation") {
    if (trip.simProgress < total - 20)
      conflict("Conclua o percurso simulado antes de repetir a volta.");
  } else {
    if (
      !fix ||
      fix.cycle !== trip.currentCycle ||
      fix.position.source !== "gps" ||
      now - fix.position.timestamp > 45000 ||
      fix.position.accuracy > 30 ||
      fix.position.speed === null ||
      fix.position.speed > 0.8
    )
      conflict(
        "Pare em segurança na origem e aguarde um GPS recente e preciso.",
      );
    if (
      now - (trip.cycleStartedAt || now) < 120000 ||
      total < 200 ||
      !fix.progress?.reliable ||
      fix.progress.alongMeters < total * 0.9 ||
      distance(fix.position, trip.snapshot.stops[0]) > 50
    )
      conflict(
        "A nova volta exige percurso anterior confirmado e retorno à origem. Um único GPS não reinicia a viagem.",
      );
  }
  const changed = await db
    .update(s.trips)
    .set({
      currentCycle: trip.currentCycle + 1,
      cycleStartedAt: now,
      simProgress: 0,
      delayUntil: null,
      waitUntil: null,
      waitStopId: null,
      revision: trip.revision + 1,
    })
    .where(
      and(
        eq(s.trips.id, trip.id),
        eq(s.trips.orgId, trip.orgId),
        eq(s.trips.revision, trip.revision),
        eq(s.trips.currentCycle, expectedCycle),
        gt(s.trips.plannedEnd, now),
      ),
    )
    .returning();
  if (!changed.length)
    conflict(
      "Viagem atualizada em outro dispositivo. Atualize e tente novamente.",
    );
  return changed[0];
}
export async function checkin(
  db: DB,
  actor: JourneyActor,
  trip: Trip,
  input: { cycle: number; stopId: string; active: boolean },
  now = Date.now(),
) {
  const own = and(
    eq(s.studentCheckins.orgId, actor.orgId),
    eq(s.studentCheckins.subject, actor.userId),
  );
  if (!input.active) {
    await db
      .delete(s.studentCheckins)
      .where(
        and(
          own,
          eq(s.studentCheckins.tripId, trip.id),
          eq(s.studentCheckins.cycle, input.cycle),
        ),
      );
    return { active: false };
  }
  if (
    trip.currentCycle !== input.cycle ||
    !input.cycle ||
    !["in_progress", "paused", "interrupted"].includes(trip.status)
  )
    conflict("Esta volta não está ativa. Atualize sua viagem.");
  const stop = trip.snapshot.stops.find((p) => p.id === input.stopId);
  const [pref] = await db
    .select()
    .from(s.journeyPreferences)
    .where(
      and(
        eq(s.journeyPreferences.orgId, actor.orgId),
        eq(s.journeyPreferences.subject, actor.userId),
        eq(s.journeyPreferences.routeId, trip.routeId),
        eq(s.journeyPreferences.stopId, input.stopId),
        eq(s.journeyPreferences.selected, true),
      ),
    );
  if (!stop || !pref)
    conflict("Selecione uma parada desta viagem antes de confirmar a espera.");
  const [fix] = await db
    .select()
    .from(s.locations)
    .where(eq(s.locations.tripId, trip.id));
  if (
    fix?.progress?.reliable &&
    fix.cycle === input.cycle &&
    now - fix.updatedAt < 60000 &&
    fix.progress.alongMeters > project(stop, trip.snapshot.geometry).along + 60
  )
    conflict("O ônibus já passou desta parada nesta volta.");
  const expiresAt = now + 15 * 60000;
  await db
    .insert(s.studentCheckins)
    .values({
      id: crypto.randomUUID(),
      orgId: actor.orgId,
      subject: actor.userId,
      tripId: trip.id,
      cycle: input.cycle,
      stopId: input.stopId,
      createdAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [s.studentCheckins.orgId, s.studentCheckins.subject],
      set: {
        tripId: trip.id,
        cycle: input.cycle,
        stopId: input.stopId,
        createdAt: now,
        expiresAt,
      },
    });
  return { active: true, expiresAt };
}
/** Only anonymous totals leave this module for operation screens. */
export async function waitingCounts(
  db: DB,
  orgId: string,
  tripIds: string[],
  now = Date.now(),
) {
  if (!tripIds.length) return [];
  const allowed = new Set(tripIds);
  const rows = await db
    .select({
      tripId: s.studentCheckins.tripId,
      cycle: s.studentCheckins.cycle,
      stopId: s.studentCheckins.stopId,
      count: sql<number>`count(*)`,
    })
    .from(s.studentCheckins)
    .innerJoin(
      s.trips,
      and(
        eq(s.trips.id, s.studentCheckins.tripId),
        eq(s.trips.orgId, s.studentCheckins.orgId),
        eq(s.trips.currentCycle, s.studentCheckins.cycle),
      ),
    )
    .where(
      and(
        eq(s.studentCheckins.orgId, orgId),
        gt(s.studentCheckins.expiresAt, now),
      ),
    )
    .groupBy(
      s.studentCheckins.tripId,
      s.studentCheckins.cycle,
      s.studentCheckins.stopId,
    );
  return rows.filter((row) => allowed.has(row.tripId));
}
