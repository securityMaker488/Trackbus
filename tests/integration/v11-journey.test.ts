import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createECDH, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/d1";
import api from "../../apps/api";
import type { State } from "../../packages/shared/types";
import {
  processSmartAlerts,
  processApproaching,
  saveWalkEstimate,
} from "../../apps/api/smart-alerts";
import {
  flushPush,
  queueForStudent,
  pushRequest,
  validPushKeys,
} from "../../apps/api/push";
import { project } from "../../packages/domain";
let mf: Miniflare,
  DB: D1Database,
  state: State,
  visitor: string,
  subject: string,
  trip: State["trips"][number];
const serverKey = createECDH("prime256v1"),
  vapid = {
    publicKey: serverKey.generateKeys().toString("base64url"),
    privateKey: serverKey.getPrivateKey().toString("base64url"),
  };
const origin = "https://trackbus.test",
  env = {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_JWK: JSON.stringify({ d: vapid.privateKey }),
    VAPID_SUBJECT: "https://trackbus.test",
  };
const ecdh = createECDH("prime256v1"),
  keys = {
    p256dh: ecdh.generateKeys().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
  endpoint = "https://fcm.googleapis.com/fcm/send/test-v11";
async function req(
  path: string,
  body?: unknown,
  cookie = "",
  user = "v11-admin",
) {
  return api.fetch(
    new Request(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(user ? { "oai-authenticated-user-id": user } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB, ...env },
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-11-01",
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const part of readFileSync("drizzle/" + file, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await DB.prepare(part).run();
  expect((await req("/bootstrap", {})).status).toBe(201);
  expect((await req("/journey/prepare", {})).status).toBe(200);
  state = (await (await req("/state")).json()) as State;
  trip = state.trips.find((t) => t.trackingMode === "simulation")!;
  const joined = await req(
    "/journey/join",
    { schoolId: state.organization.id, name: "Aluno V11" },
    "",
    "",
  );
  visitor = joined.headers.get("set-cookie")!.split(";")[0];
  subject = (
    (await (await req("/me", undefined, visitor, "")).json()) as {
      actor: { userId: string };
    }
  ).actor.userId;
  expect(
    (
      await req(
        "/journey/select",
        {
          routeId: trip.routeId,
          stopId: trip.snapshot.stops.at(-1)!.id,
          favorite: true,
          notify: true,
        },
        visitor,
        "",
      )
    ).status,
  ).toBe(200);
  expect(
    (await req(`/trips/${trip.id}/status`, { status: "in_progress" })).status,
  ).toBe(200);
  trip = ((await (await req("/state")).json()) as State).trips.find(
    (t) => t.id === trip.id,
  )!;
  expect(trip.currentCycle).toBe(1);
  expect((await req(`/trips/${trip.id}/simulate`, { speed: 7 })).status).toBe(
    200,
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await mf?.dispose();
});
it("confirma espera uma vez, entrega somente totais e isola instituição/volta", async () => {
  const body = {
    tripId: trip.id,
    cycle: 1,
    stopId: trip.snapshot.stops.at(-1)!.id,
    active: true,
  };
  expect((await req("/journey/checkin", body, visitor, "")).status).toBe(200);
  expect((await req("/journey/checkin", body, visitor, "")).status).toBe(200);
  const admin = (await (await req("/state")).json()) as State;
  expect(admin.waiting).toEqual([
    { tripId: trip.id, cycle: 1, stopId: body.stopId, count: 1 },
  ]);
  expect(JSON.stringify(admin.waiting)).not.toContain(subject);
  expect(
    (
      await req(
        "/journey/select",
        {
          routeId: trip.routeId,
          stopId: body.stopId,
          favorite: true,
          notify: true,
        },
        visitor,
        "",
      )
    ).status,
  ).toBe(200);
  expect(
    ((await (await req("/state")).json()) as State).waiting[0]?.count,
  ).toBe(1);
  expect(
    (await req("/journey/checkin", { ...body, cycle: 99 }, visitor, "")).status,
  ).toBe(409);
  expect(
    (
      await req(
        `/trips/${trip.id}/cycles`,
        { expectedCycle: 1, safe: true },
        visitor,
        "",
      )
    ).status,
  ).toBe(403);
  expect((await req("/bootstrap", {}, "", "second-v11-admin")).status).toBe(
    201,
  );
  expect(
    (
      await req(
        `/trips/${trip.id}/cycles`,
        { expectedCycle: 1, safe: true },
        "",
        "second-v11-admin",
      )
    ).status,
  ).toBe(404);
  await DB.prepare("UPDATE student_checkins SET expires_at=?")
    .bind(Date.now() - 1)
    .run();
  expect(((await (await req("/state")).json()) as State).waiting).toEqual([]);
  expect((await req("/journey/checkin", body, visitor, "")).status).toBe(200);
});
it("registra push cifrado, tenta novamente, deduplica e remove inscrição 410", async () => {
  expect(await validPushKeys(keys)).toBe(true);
  const registered = await req(
    "/journey/push",
    { endpoint, enabled: true, keys, privatePreview: false },
    visitor,
    "",
  );
  expect(registered.status).toBe(200);
  const details = await pushRequest({ endpoint, ...keys }, env, {
    body: "Mensagem privada",
  });
  expect(new Headers(details.headers).get("Content-Encoding")).toBe(
    "aes128gcm",
  );
  expect(new TextDecoder().decode(details.body)).not.toContain(
    "Mensagem privada",
  );
  const ctx = {
    id: "push-fixture",
    orgId: trip.orgId,
    subject,
    tripId: trip.id,
    cycle: 1,
    routeId: trip.routeId,
    stopId: trip.snapshot.stops.at(-1)!.id,
    category: "leave",
    message: "Hora de sair",
    expires: Date.now() + 120000,
  };
  await queueForStudent(drizzle(DB), ctx);
  await queueForStudent(drizzle(DB), ctx);
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 201 }));
  await flushPush(drizzle(DB), env, Date.now(), send);
  expect(send).toHaveBeenCalledTimes(1);
  const queued = await DB.prepare(
    "SELECT status,attempts FROM push_deliveries",
  ).first();
  expect(queued).toMatchObject({ status: "pending", attempts: 1 });
  await flushPush(drizzle(DB), env, Date.now() + 16000, send);
  expect(
    await DB.prepare("SELECT status,attempts FROM push_deliveries").first(),
  ).toMatchObject({ status: "sent", attempts: 2 });
  await flushPush(drizzle(DB), env, Date.now() + 17000, send);
  expect(send).toHaveBeenCalledTimes(2);
  await queueForStudent(drizzle(DB), { ...ctx, id: "expired-endpoint" });
  await flushPush(
    drizzle(DB),
    env,
    Date.now(),
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 410 })),
  );
  expect(
    (await DB.prepare("SELECT count(*) AS n FROM push_subscriptions").first())
      ?.n,
  ).toBe(0);
});
it("calcula alertas sem posição do aluno, uma vez por fase, e pede atualização quando expira", async () => {
  const context = {
    orgId: trip.orgId,
    subject,
    tripId: trip.id,
    cycle: 1,
    routeId: trip.routeId,
    stopId: trip.snapshot.stops.at(-1)!.id,
    seconds: 300,
  };
  await saveWalkEstimate(drizzle(DB), context);
  await processSmartAlerts(drizzle(DB), trip.id);
  const a = await DB.prepare("SELECT * FROM journey_alerts").all();
  expect(a.results.length).toBeGreaterThan(0);
  const estimate = await DB.prepare("SELECT * FROM walk_estimates").first();
  expect(estimate).not.toHaveProperty("lat");
  expect(estimate).not.toHaveProperty("lng");
  await DB.prepare("UPDATE walk_estimates SET next_check_at=0").run();
  await processSmartAlerts(drizzle(DB), trip.id);
  expect(
    (await DB.prepare("SELECT count(*) AS n FROM journey_alerts").first())?.n,
  ).toBe(a.results.length);
  await DB.prepare(
    "UPDATE walk_estimates SET next_check_at=0,valid_until=0",
  ).run();
  await processSmartAlerts(drizzle(DB), trip.id);
  expect(
    (
      await DB.prepare(
        "SELECT message FROM journey_alerts WHERE category='refresh'",
      ).first()
    )?.message,
  ).toContain("atualizar sua caminhada");
});
it("avisa aproximação sem caminhada, sem inventar duração e sem repetir evento", async () => {
  await DB.prepare("DELETE FROM walk_estimates WHERE subject=?")
    .bind(subject)
    .run();
  await DB.prepare(
    "DELETE FROM journey_alerts WHERE subject=? AND category='approaching'",
  )
    .bind(subject)
    .run();
  const stop = trip.snapshot.stops.at(-1)!;
  const now = Date.now();
  const position = {
    lat: stop.lat,
    lng: stop.lng,
    accuracy: 5,
    timestamp: now,
    speed: 7,
    heading: 0,
    source: "simulation",
  };
  await DB.prepare(
    "UPDATE locations SET position=?,updated_at=? WHERE trip_id=?",
  )
    .bind(JSON.stringify(position), now, trip.id)
    .run();
  await processApproaching(drizzle(DB), now);
  await processApproaching(drizzle(DB), now + 61000);
  expect(
    (
      await DB.prepare(
        "SELECT count(*) AS n FROM journey_alerts WHERE subject=? AND category='approaching'",
      )
        .bind(subject)
        .first()
    )?.n,
  ).toBe(1);
  expect(
    (
      await DB.prepare(
        "SELECT count(*) AS n FROM walk_estimates WHERE subject=?",
      )
        .bind(subject)
        .first()
    )?.n,
  ).toBe(0);
});
it("limita lotes e consultas no D1 antes de processar os próximos participantes", async () => {
  for (let i = 0; i < 9; i++) {
    const person = `budget-${i}`;
    await DB.prepare(
      "INSERT INTO journey_preferences(id,org_id,subject,route_id,stop_id,favorite,selected,notify) VALUES(?,?,?,?,?,0,1,1)",
    )
      .bind(
        person,
        trip.orgId,
        person,
        trip.routeId,
        trip.snapshot.stops.at(-1)!.id,
      )
      .run();
    await saveWalkEstimate(drizzle(DB), {
      orgId: trip.orgId,
      subject: person,
      tripId: trip.id,
      cycle: 1,
      routeId: trip.routeId,
      stopId: trip.snapshot.stops.at(-1)!.id,
      seconds: 300,
    });
    await DB.prepare(
      "INSERT INTO push_subscriptions(id,org_id,subject,endpoint,expires,p256dh,auth) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        person,
        trip.orgId,
        person,
        `https://fcm.googleapis.com/fcm/send/${person}`,
        Date.now() + 3600000,
        keys.p256dh,
        keys.auth,
      )
      .run();
    await queueForStudent(drizzle(DB), {
      id: person,
      orgId: trip.orgId,
      subject: person,
      tripId: trip.id,
      cycle: 1,
      routeId: trip.routeId,
      stopId: trip.snapshot.stops.at(-1)!.id,
      category: "leave",
      message: "Teste de limite",
      expires: Date.now() + 120000,
    });
  }
  const queries: string[] = [];
  const measured = drizzle(DB, {
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  });
  await processSmartAlerts(measured, trip.id);
  expect(
    queries.filter((q) => q.startsWith("UPDATE walk_estimates")),
  ).toHaveLength(4);
  expect(queries.length).toBeLessThanOrEqual(21);
  const estimateQueries = queries.length;
  queries.length = 0;
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 201 }));
  await flushPush(measured, env, Date.now(), send);
  expect(
    queries.filter((q) =>
      q.startsWith("UPDATE push_deliveries SET status='sending'"),
    ),
  ).toHaveLength(4);
  expect(queries.length).toBeLessThanOrEqual(17);
  expect(send).not.toHaveBeenCalled(); // No authenticated membership: fail closed.
  console.info(
    `Free budget: ${estimateQueries} consultas de estimativas; ${queries.length} consultas de fila; 4 itens por lote.`,
  );
  await DB.prepare(
    "DELETE FROM walk_estimates WHERE subject LIKE 'budget-%'",
  ).run();
  await DB.prepare(
    "DELETE FROM journey_preferences WHERE subject LIKE 'budget-%'",
  ).run();
  await DB.prepare(
    "DELETE FROM push_subscriptions WHERE subject LIKE 'budget-%'",
  ).run();
  await DB.prepare(
    "DELETE FROM journey_alerts WHERE subject LIKE 'budget-%'",
  ).run();
});
it("reinicia somente após percurso, apaga posição e esperas antigas e respeita o horário final", async () => {
  expect(
    (await req(`/trips/${trip.id}/cycles`, { expectedCycle: 1, safe: true }))
      .status,
  ).toBe(409);
  const total = project(trip.snapshot.stops[0], trip.snapshot.geometry).total;
  await DB.prepare("UPDATE trips SET sim_progress=? WHERE id=?")
    .bind(total, trip.id)
    .run();
  expect(
    (await req(`/trips/${trip.id}/cycles`, { expectedCycle: 1, safe: true }))
      .status,
  ).toBe(200);
  const current = (await (await req("/state")).json()) as State;
  expect(current.trips.find((t) => t.id === trip.id)?.currentCycle).toBe(2);
  expect(current.cycles.filter((c) => c.tripId === trip.id)).toHaveLength(2);
  expect(current.locations.some((l) => l.tripId === trip.id)).toBe(false);
  expect(current.waiting).toEqual([]);
  expect(
    (await DB.prepare("SELECT count(*) AS n FROM walk_estimates").first())?.n,
  ).toBe(0);
  expect(
    (await req(`/trips/${trip.id}/cycles`, { expectedCycle: 1, safe: true }))
      .status,
  ).toBe(409);
  await DB.prepare("UPDATE trips SET planned_end=?,sim_progress=? WHERE id=?")
    .bind(Date.now() - 1, total, trip.id)
    .run();
  expect(
    (await req(`/trips/${trip.id}/cycles`, { expectedCycle: 2, safe: true }))
      .status,
  ).toBe(409);
  expect(
    (await req(`/trips/${trip.id}/status`, { status: "completed" })).status,
  ).toBe(200);
  expect(
    (
      await DB.prepare(
        "SELECT ended_at FROM trip_cycles WHERE trip_id=? AND number=2",
      )
        .bind(trip.id)
        .first()
    )?.ended_at,
  ).toBeTruthy();
});

it("cancela recomendação enfileirada depois do encerramento da viagem", async () => {
  expect(
    (await req("/journey/push", { endpoint, enabled: true, keys }, visitor, ""))
      .status,
  ).toBe(200);
  for (const category of ["leave", "refresh"])
    await queueForStudent(drizzle(DB), {
      id: "post-close-" + category,
      orgId: trip.orgId,
      subject,
      tripId: trip.id,
      cycle: 2,
      routeId: trip.routeId,
      stopId: trip.snapshot.stops.at(-1)!.id,
      category,
      message: "Não deve ser entregue",
      expires: Date.now() + 120000,
    });
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 201 }));
  await flushPush(drizzle(DB), env, Date.now(), send);
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await DB.prepare(
        "SELECT count(*) AS n FROM push_deliveries WHERE id LIKE 'post-close-%' AND status='cancelled'",
      ).first()
    )?.n,
  ).toBe(2);
});
