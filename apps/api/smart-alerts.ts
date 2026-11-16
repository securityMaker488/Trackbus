import { eq, sql } from "drizzle-orm";
import type { DB } from "./access";
import * as s from "../../db/schema";
import {
  estimateArrival,
  project,
  type Itinerary,
  type Position,
  type TripStatus,
} from "../../packages/domain";
import type { TrackingProgress } from "../../packages/domain/tracking";
import { flushPush, queueForStudent, queueNotice, type PushEnv } from "./push";
import { expireWaits } from "./notifications";
import { expireGoogleGeometry } from "./geometry-retention";
type Estimate = {
  id: string;
  org_id: string;
  subject: string;
  trip_id: string;
  cycle: number;
  route_id: string;
  stop_id: string;
  seconds: number;
  calculated_at: number;
  valid_until: number;
  next_check_at: number;
  phase: number;
  snapshot: string;
  position: string | null;
  progress: string | null;
  position_cycle: number | null;
  current_cycle: number;
  trip_status: TripStatus;
  delay_until: number | null;
  wait_until: number | null;
  safety_margin: number;
  allowed: number;
};
/** Store duration/context only. Student coordinates never enter persistence. */
export async function saveWalkEstimate(
  db: DB,
  context: {
    orgId: string;
    subject: string;
    tripId: string;
    cycle: number;
    routeId: string;
    stopId: string;
    seconds: number;
  },
  now = Date.now(),
) {
  await db.run(sql`INSERT INTO walk_estimates(id,org_id,subject,trip_id,cycle,route_id,stop_id,seconds,calculated_at,valid_until,next_check_at)
    SELECT ${crypto.randomUUID()},${context.orgId},${context.subject},id,current_cycle,route_id,${context.stopId},${context.seconds},${now},${now + 600000},${now}
    FROM trips WHERE id=${context.tripId} AND org_id=${context.orgId} AND current_cycle=${context.cycle} AND status IN ('in_progress','paused','interrupted')
    ON CONFLICT(org_id,subject) DO UPDATE SET trip_id=excluded.trip_id,cycle=excluded.cycle,route_id=excluded.route_id,stop_id=excluded.stop_id,seconds=excluded.seconds,calculated_at=excluded.calculated_at,valid_until=excluded.valid_until,next_check_at=excluded.next_check_at,
    phase=CASE WHEN walk_estimates.trip_id=excluded.trip_id AND walk_estimates.cycle=excluded.cycle AND walk_estimates.stop_id=excluded.stop_id THEN walk_estimates.phase ELSE 0 END`);
}
export function smartPhase(
  busMinutes: number | null,
  walkingSeconds: number,
  margin: number,
  valid: boolean,
  passed: boolean,
) {
  if (passed)
    return {
      rank: 40,
      category: "passed",
      message:
        "O ônibus já passou desta parada nesta volta. Consulte a próxima opção e não tente alcançar o veículo.",
    };
  if (!valid)
    return {
      rank: 0,
      category: "refresh",
      message:
        "Abra o TrackBus para atualizar sua caminhada. A estimativa anterior perdeu a validade.",
    };
  if (busMinutes === null) return null;
  const available = busMinutes - walkingSeconds / 60 - margin;
  if (available < 0)
    return {
      rank: 30,
      category: "late",
      message:
        "O ônibus poderá chegar antes de você. Não corra nem tente alcançar o veículo em movimento.",
    };
  if (available <= 2)
    return {
      rank: 20,
      category: "leave",
      message:
        "Hora recomendada de sair para a parada. Confira a estimativa atual no TrackBus e caminhe com segurança.",
    };
  if (available <= 5)
    return {
      rank: 10,
      category: "prepare",
      message:
        "Prepare-se para sair. O horário recomendado está se aproximando; confira sua viagem.",
    };
  return null;
}
export async function processSmartAlerts(
  db: DB,
  tripId?: string,
  now = Date.now(),
  limit = 4,
) {
  const estimates = await db.all<Estimate>(
    sql`SELECT w.*,t.snapshot,t.current_cycle,t.status AS trip_status,t.delay_until,t.wait_until,
      l.position,l.progress,l.cycle AS position_cycle,o.safety_margin,
      CASE WHEN t.current_cycle=w.cycle AND t.status IN ('in_progress','paused','interrupted')
        AND r.published=1 AND r.active=1 AND r.approval='approved' AND r.archived_at IS NULL
        AND p.id IS NOT NULL THEN 1 ELSE 0 END AS allowed
      FROM walk_estimates w
      LEFT JOIN trips t ON t.id=w.trip_id AND t.org_id=w.org_id AND t.route_id=w.route_id
      LEFT JOIN routes r ON r.id=w.route_id AND r.org_id=w.org_id
      LEFT JOIN organizations o ON o.id=w.org_id
      LEFT JOIN locations l ON l.trip_id=t.id AND l.org_id=w.org_id
      LEFT JOIN journey_preferences p ON p.org_id=w.org_id AND p.subject=w.subject
        AND p.route_id=w.route_id AND p.stop_id=w.stop_id AND p.selected=1 AND p.notify=1
      WHERE w.next_check_at<=${now} ${tripId ? sql`AND w.trip_id=${tripId}` : sql``}
      ORDER BY w.next_check_at LIMIT ${Math.max(1, Math.min(4, limit))}`,
  );
  const groups = new Map<string, Estimate[]>();
  for (const e of estimates)
    groups.set(e.trip_id, [...(groups.get(e.trip_id) || []), e]);
  for (const rows of groups.values()) {
    const first = rows[0];
    const snapshot = first.snapshot
      ? (JSON.parse(first.snapshot) as Itinerary)
      : null;
    const position = first.position
      ? (JSON.parse(first.position) as Position)
      : null;
    const progress = first.progress
      ? (JSON.parse(first.progress) as TrackingProgress)
      : null;
    const fresh =
      !!position &&
      first.position_cycle === first.current_cycle &&
      now - position.timestamp <= 60000;
    // Geometry and GPS are parsed once per trip, never once per student.
    const estimatesByStop = new Map<
      string,
      ReturnType<typeof estimateArrival>
    >();
    for (const e of rows) {
      const stop = snapshot?.stops.find((p) => p.id === e.stop_id);
      if (!e.allowed || !stop || !snapshot) {
        await db.run(sql`DELETE FROM walk_estimates WHERE id=${e.id}`);
        continue;
      }
      const valid = now <= e.valid_until;
      const passed = !!(
        fresh &&
        progress?.reliable &&
        progress.alongMeters > project(stop, snapshot.geometry).along + 60
      );
      const eta =
        estimatesByStop.get(e.stop_id) ||
        estimateArrival({
          position: fresh ? position : null,
          itinerary: snapshot,
          stopId: e.stop_id,
          status: first.trip_status,
          delayUntil: first.delay_until,
          waitUntil: first.wait_until,
          now,
        });
      estimatesByStop.set(e.stop_id, eta);
      const phase = smartPhase(
        eta.available ? eta.minMinutes : null,
        e.seconds,
        e.safety_margin ?? 3,
        valid,
        passed,
      );
      const events = [
        ...(phase && (phase.rank > e.phase || phase.category === "refresh")
          ? [phase]
          : []),
        ...(eta.available && eta.minMinutes <= 3 && fresh && !passed
          ? [
              {
                rank: 0,
                category: "approaching",
                message:
                  "O ônibus está se aproximando da parada selecionada. Confira a posição no TrackBus.",
              },
            ]
          : []),
      ];
      for (const event of events) {
        const alertId = `${e.trip_id}:${e.cycle}:${e.subject}:${e.stop_id}:${event.category}`;
        const message =
          (position?.source === "simulation" ? "SIMULAÇÃO · " : "") +
          event.message;
        await db.run(
          sql`INSERT OR IGNORE INTO journey_alerts(id,org_id,subject,trip_id,cycle,route_id,stop_id,category,message,created_at,expires_at) VALUES(${alertId},${e.org_id},${e.subject},${e.trip_id},${e.cycle},${e.route_id},${e.stop_id},${event.category},${message},${now},${now + 86400000})`,
        );
        await queueForStudent(
          db,
          {
            id: alertId,
            orgId: e.org_id,
            subject: e.subject,
            tripId: e.trip_id,
            cycle: e.cycle,
            routeId: e.route_id,
            stopId: e.stop_id,
            category: event.category,
            message,
            expires: now + 120000,
          },
          now,
        );
      }
      await db.run(
        sql`UPDATE walk_estimates SET next_check_at=${!valid || passed ? now + 86400000 : now + 60000},phase=MAX(phase,${phase?.rank || 0}) WHERE id=${e.id} AND calculated_at=${e.calculated_at}`,
      );
    }
  }
}
export async function runNotificationTick(
  db: DB,
  env: PushEnv & { DB?: D1Database },
  now = Date.now(),
) {
  const maintenance = Math.floor(now / 60000) % 4;
  if (env.DB && maintenance % 2 === 0) {
    const orgs = await db.all<{ org_id: string }>(
      sql`SELECT org_id FROM trips WHERE wait_until<=${now} ORDER BY wait_until LIMIT 1`,
    );
    for (const org of orgs) await expireWaits(env.DB, org.org_id, 1);
    const ended = await db.all<{ id: string; trip_id: string }>(
      sql`SELECT id,trip_id FROM notices WHERE category='wait_ended' AND created_at>=${now - 180000} ORDER BY created_at DESC LIMIT 1`,
    );
    for (const n of ended) {
      const [trip] = await db
        .select()
        .from(s.trips)
        .where(eq(s.trips.id, n.trip_id));
      if (trip) await queueNotice(db, env, trip, n.id, false);
    }
  }
  if (maintenance === 1) await expireGoogleGeometry(db, now);
  await processSmartAlerts(db, undefined, now, 2);
  await processApproaching(db, now);
  await flushPush(db, env, now);
  if (maintenance !== 3) return;
  await db.run(sql`DELETE FROM student_checkins WHERE expires_at<=${now}`);
  await db.run(
    sql`DELETE FROM walk_estimates WHERE valid_until<${now - 86400000}`,
  );
  await db.run(sql`DELETE FROM journey_alerts WHERE expires_at<${now}`);
  await db.run(
    sql`DELETE FROM push_deliveries WHERE expires_at<${now - 86400000}`,
  );
  await db.run(sql`DELETE FROM push_subscriptions WHERE expires<=${now}`);
}

/** Approaching needs a selected stop, never a fabricated walking duration. */
export async function processApproaching(db: DB, now = Date.now()) {
  const rows = await db.all<{
    id: string;
    org_id: string;
    subject: string;
    route_id: string;
    stop_id: string;
    trip_id: string;
    current_cycle: number;
    snapshot: string;
    position: string;
    progress: string | null;
    status: TripStatus;
    delay_until: number | null;
    wait_until: number | null;
  }>(sql`SELECT p.id,p.org_id,p.subject,p.route_id,p.stop_id,t.id AS trip_id,t.current_cycle,
      t.snapshot,l.position,l.progress,t.status,t.delay_until,t.wait_until
    FROM journey_preferences p
    JOIN routes r ON r.id=p.route_id AND r.org_id=p.org_id AND r.active=1 AND r.published=1 AND r.approval='approved' AND r.archived_at IS NULL
    JOIN trips t ON t.route_id=r.id AND t.org_id=p.org_id AND t.status IN ('in_progress','paused','interrupted')
    JOIN locations l ON l.trip_id=t.id AND l.org_id=p.org_id AND l.cycle=t.current_cycle
    WHERE p.selected=1 AND p.notify=1 AND p.next_alert_check_at<=${now}
    AND json_extract(l.position,'$.timestamp')>=${now - 60000}
    AND NOT EXISTS (SELECT 1 FROM walk_estimates w WHERE w.org_id=p.org_id AND w.subject=p.subject AND w.trip_id=t.id AND w.cycle=t.current_cycle AND w.stop_id=p.stop_id AND w.valid_until>${now})
    AND NOT EXISTS (SELECT 1 FROM trips newer WHERE newer.route_id=t.route_id AND newer.org_id=t.org_id AND newer.status IN ('in_progress','paused','interrupted') AND newer.planned_start>t.planned_start)
    AND NOT EXISTS (SELECT 1 FROM journey_alerts a WHERE a.id=t.id||':'||t.current_cycle||':'||p.subject||':'||p.stop_id||':approaching')
    ORDER BY p.next_alert_check_at LIMIT 2`);
  for (const row of rows) {
    const snapshot = JSON.parse(row.snapshot) as Itinerary;
    const position = JSON.parse(row.position) as Position;
    const progress = row.progress
      ? (JSON.parse(row.progress) as TrackingProgress)
      : null;
    const stop = snapshot.stops.find((s) => s.id === row.stop_id);
    const passed = !!(
      stop &&
      progress?.reliable &&
      progress.alongMeters > project(stop, snapshot.geometry).along + 60
    );
    const eta = estimateArrival({
      position,
      itinerary: snapshot,
      stopId: row.stop_id,
      status: row.status,
      delayUntil: row.delay_until,
      waitUntil: row.wait_until,
      now,
    });
    if (stop && !passed && eta.available && eta.minMinutes <= 3) {
      const id = `${row.trip_id}:${row.current_cycle}:${row.subject}:${row.stop_id}:approaching`;
      const message =
        (position.source === "simulation" ? "SIMULAÇÃO · " : "") +
        "O ônibus está se aproximando da parada selecionada. Confira a posição no TrackBus.";
      await db.run(
        sql`INSERT OR IGNORE INTO journey_alerts(id,org_id,subject,trip_id,cycle,route_id,stop_id,category,message,created_at,expires_at) VALUES(${id},${row.org_id},${row.subject},${row.trip_id},${row.current_cycle},${row.route_id},${row.stop_id},'approaching',${message},${now},${now + 86400000})`,
      );
      await queueForStudent(
        db,
        {
          id,
          orgId: row.org_id,
          subject: row.subject,
          tripId: row.trip_id,
          cycle: row.current_cycle,
          routeId: row.route_id,
          stopId: row.stop_id,
          category: "approaching",
          message,
          expires: now + 120000,
        },
        now,
      );
    }
    await db.run(
      sql`UPDATE journey_preferences SET next_alert_check_at=${now + 60000} WHERE id=${row.id} AND route_id=${row.route_id} AND stop_id=${row.stop_id}`,
    );
  }
}
