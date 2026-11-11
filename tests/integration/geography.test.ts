import { drizzle } from "drizzle-orm/d1";
import { seedScenario } from "../fixtures/scenario";
import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import api from "../../apps/api";
import type { State } from "../../packages/shared/types";
import type { journeyState } from "../../apps/api/journey";
import places from "../../packages/geodata/paraiba-places.json";
let mf: Miniflare, DB: D1Database;
const origin = "https://trackbus.test";
async function request(
  path: string,
  body?: unknown,
  user = "geography-admin",
  cookie = "",
  method = body === undefined ? "GET" : "POST",
) {
  return api.fetch(
    new Request(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(user ? { "oai-authenticated-user-id": user } : {}),
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB },
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-05-15",
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync("drizzle/" + file, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await DB.prepare(sql).run();
  await seedScenario(
    drizzle(DB),
    "geography-admin",
    "Administrador geográfico",
  );
});
afterAll(async () => {
  await mf?.dispose();
});
it("aceita localidades PB e percurso intermunicipal sem fabricar geometria viária", async () => {
  expect(places.places).toHaveLength(223);
  for (const name of [
    "Campina Grande",
    "Guarabira",
    "João Pessoa",
    "Patos",
    "Sousa",
    "Cajazeiras",
    "Areia",
    "Bananeiras",
    "Queimadas",
    "Lagoa Seca",
  ]) {
    const point = places.places.find((p) => p.name === name)!;
    expect(point).toBeDefined();
    const data = {
      name: "Rota " + name,
      shift: "Manhã",
      departureTime: "06:30",
      stops: [
        {
          id: "a",
          name: "Origem",
          lat: point.lat,
          lng: point.lng,
          dwellSeconds: 30,
        },
        {
          id: "b",
          name: "Destino rural",
          lat: point.lat - 0.08,
          lng: point.lng + 0.08,
          dwellSeconds: 30,
        },
      ],
    };
    const r = await request("/routes", data);
    expect(r.status).toBe(201);
  }
  const a = places.places.find((p) => p.name === "Campina Grande")!,
    b = places.places.find((p) => p.name === "João Pessoa")!;
  const result = await request("/routes", {
    name: "Intermunicipal PB",
    shift: "Tarde",
    stops: [
      { id: "cg", name: a.name, lat: a.lat, lng: a.lng, dwellSeconds: 0 },
      { id: "jp", name: b.name, lat: b.lat, lng: b.lng, dwellSeconds: 0 },
    ],
  });
  expect(result.status).toBe(201);
  const state = (await (await request("/state")).json()) as State;
  const route = state.routes.find((r) => r.name === "Intermunicipal PB")!;
  expect(route.routed).toBe(false);
  expect(route.geometry).toEqual([
    [a.lng, a.lat],
    [b.lng, b.lat],
  ]);
});
it("persiste horário e paradas, publica para aluno sem vínculo e oculta ao desativar", async () => {
  const state = (await (await request("/state")).json()) as State,
    route = state.routes.find((r) => r.name === "Rota Campina Grande")!;
  expect(route.departureTime).toBe("06:30");
  const joined = await request(
    "/journey/join",
    { schoolId: state.organization.id, name: "Visitante PB" },
    "",
  );
  expect(joined.status).toBe(201);
  const cookie = joined.headers.get("set-cookie")!.split(";")[0];
  const catalog = async () =>
    (
      (await (
        await request("/journey/state", undefined, "", cookie)
      ).json()) as Awaited<ReturnType<typeof journeyState>>
    ).routes;
  expect((await catalog()).some((r: { id: string }) => r.id === route.id)).toBe(
    false,
  );
  expect(
    (await request("/routes/" + route.id + "/visibility", { published: true }))
      .status,
  ).toBe(200);
  expect(
    (await catalog()).find((r: { id: string }) => r.id === route.id)!.stops,
  ).toEqual(route.stops);
  expect(
    (
      await request(
        "/journey/select",
        {
          routeId: route.id,
          stopId: route.stops[1].id,
          favorite: true,
          notify: true,
        },
        "",
        cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("/routes", { name: "Intrusão" }, "", cookie)).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/routes/" + route.id,
        {
          name: route.name,
          description: route.description,
          shift: route.shift,
          departureTime: "06:45",
          active: false,
          stops: route.stops,
        },
        undefined,
        "",
        "PUT",
      )
    ).status,
  ).toBe(200);
  expect((await catalog()).some((r: { id: string }) => r.id === route.id)).toBe(
    false,
  );
  expect(
    await DB.prepare("SELECT departure_time,active FROM routes WHERE id=?")
      .bind(route.id)
      .first(),
  ).toEqual({ departure_time: "06:45", active: 0 });
});
it("rejeita horário inválido e coordenadas inválidas sem gravar", async () => {
  const result = await request("/routes", {
    name: "Inválida",
    shift: "Manhã",
    departureTime: "25:90",
    stops: [
      { id: "a", name: "Origem", lat: 91, lng: -35, dwellSeconds: 0 },
      { id: "b", name: "Fim", lat: -7, lng: -35, dwellSeconds: 0 },
    ],
  });
  expect(result.status).toBe(422);
  expect(
    await DB.prepare("SELECT id FROM routes WHERE name=?")
      .bind("Inválida")
      .first(),
  ).toBeNull();
});

it("visitante marca aviso autorizado como lido e logout remove leitura e push", async () => {
  const state = (await (await request("/state")).json()) as State;
  const trip = state.trips.find((t) => t.name.includes("Ida · Rota 01"))!;
  await request("/notices", {
    tripId: trip.id,
    category: "information",
    message: "Comunicado para leitura PB",
    delayMinutes: 0,
  });
  const joined = await request(
      "/journey/join",
      { schoolId: state.organization.id, name: "Leitor PB" },
      "",
    ),
    cookie = joined.headers.get("set-cookie")!.split(";")[0];
  const route = state.routes.find((r) => r.id === trip.routeId)!;
  await request(
    "/journey/select",
    {
      routeId: route.id,
      stopId: route.stops[1].id,
      favorite: true,
      notify: true,
    },
    "",
    cookie,
  );
  const journey = (await (
    await request("/journey/state", undefined, "", cookie)
  ).json()) as Awaited<ReturnType<typeof journeyState>>;
  const notice = journey.notices.find(
    (n) => n.message === "Comunicado para leitura PB",
  )!;
  expect(notice.read).toBe(false);
  expect(
    (await request("/notices/" + notice.id + "/read", {}, "", cookie)).status,
  ).toBe(200);
  const latest = (await (
    await request("/journey/state", undefined, "", cookie)
  ).json()) as Awaited<ReturnType<typeof journeyState>>;
  expect(latest.notices.find((n) => n.id === notice.id)?.read).toBe(true);
  expect(
    (
      await request(
        "/journey/push",
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-pb-reader",
          enabled: true,
        },
        "",
        cookie,
      )
    ).status,
  ).toBe(503);
  // Seed an existing subscription to test revocation independently of push credentials/delivery.
  await DB.prepare(
    "INSERT INTO push_subscriptions (id,org_id,subject,endpoint,expires) VALUES (?,?,?,?,?)",
  )
    .bind(
      "reader-push",
      state.organization.id,
      journey.preferences[0].subject,
      "https://fcm.googleapis.com/fcm/send/test-pb-reader",
      Date.now() + 60000,
    )
    .run();
  await request("/routes/" + route.id + "/visibility", { published: false });
  expect(
    (await request("/notices/" + notice.id + "/read", {}, "", cookie)).status,
  ).toBe(404);
  expect((await request("/journey/leave", {}, "", cookie)).status).toBe(200);
  expect(
    await DB.prepare("SELECT id FROM push_subscriptions WHERE endpoint=?")
      .bind("https://fcm.googleapis.com/fcm/send/test-pb-reader")
      .first(),
  ).toBeNull();
  expect(
    await DB.prepare("SELECT id FROM read_receipts WHERE notice_id=?")
      .bind(notice.id)
      .first(),
  ).toBeNull();
});
