import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import api from "../../apps/api";
import type { State } from "../../packages/shared/types";
import type { PoiResult } from "../../packages/shared/pois";
import { digest } from "../../apps/api/access";
let mf: Miniflare,
  DB: D1Database,
  school: State,
  other: State,
  token: string,
  editor: string,
  driverCookie: string;
const origin = "https://trackbus.test";
async function req(
  path: string,
  body?: unknown,
  options: {
    user?: string;
    cookie?: string;
    token?: string;
    method?: string;
    origin?: string;
  } = {},
) {
  return api.fetch(
    new Request(origin + "/api" + path, {
      method: options.method || (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: options.origin || origin,
        "Content-Type": "application/json",
        ...(options.user === undefined
          ? { "oai-authenticated-user-id": "editor-admin" }
          : options.user
            ? { "oai-authenticated-user-id": options.user }
            : {}),
        Cookie: options.cookie || "",
        ...(options.token ? { Authorization: "Bearer " + options.token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB },
  );
}
const stops = [
  {
    id: "a",
    name: "Parada 01",
    lat: -7.2227228,
    lng: -35.8774256,
    dwellSeconds: 30,
  },
  {
    id: "b",
    name: "Parada 02",
    lat: -7.2257942,
    lng: -35.8845174,
    dwellSeconds: 30,
  },
];
const draft = { name: "Nova rota 01", shift: "Manhã", stops };
const driver = () => ({ user: "", cookie: editor });
async function current() {
  return (await (await req("/state")).json()) as State;
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
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync("drizzle/" + f, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await DB.prepare(sql).run();
  expect((await req("/bootstrap", {})).status).toBe(201);
  school = await current();
  expect((await req("/bootstrap", {}, { user: "other-admin" })).status).toBe(
    201,
  );
  other = (await (
    await req("/state", undefined, { user: "other-admin" })
  ).json()) as State;
  const pair = (await (
    await req("/driver/pair", { driverId: school.drivers[0].id })
  ).json()) as { code: string };
  token = (
    (await (
      await req("/driver/exchange", { code: pair.code }, { user: "" })
    ).json()) as { token: string }
  ).token;
  const profile = await req("/demo/profile", { role: "driver" });
  driverCookie = profile.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  await mf?.dispose();
});
it("troca de uso único mantém token nativo fora do navegador e restringe a sessão ao editor", async () => {
  const link = await req("/driver/editor-link", {}, { user: "", token });
  expect(link.status).toBe(200);
  const { code } = (await link.json()) as { code: string };
  expect(code).not.toBe(token);
  const exchange = await req("/driver/web-exchange", { code }, { user: "" });
  expect(exchange.status).toBe(200);
  const cookies = exchange.headers.getSetCookie();
  const cookie = cookies.find((c) => c.startsWith("tb_driver="))!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict");
  editor = cookie.split(";")[0];
  expect(
    (await req("/driver/web-exchange", { code }, { user: "" })).status,
  ).toBe(401);
  expect((await req("/state", undefined, driver())).status).toBe(200);
  for (const path of [
    "/vehicles",
    "/settings",
    "/demo/profile",
    "/driver/pair",
    "/notices",
  ]) {
    expect((await req(path, {}, driver())).status).toBe(403);
  }
  expect(
    (await req("/routes", draft, { ...driver(), origin: "https://evil.test" }))
      .status,
  ).toBe(403);
  expect((await req("/routes", draft, { user: "", token })).status).toBe(403);
});
it("rascunho privado, revisão com justificativa, reenvio, aprovação e publicação explícita", async () => {
  const created = await req("/routes", draft, driver());
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  let route = (await current()).routes.find((r) => r.id === id)!;
  expect(route.approval).toBe("draft");
  expect(route.published).toBe(false);
  expect(route.distanceMeters).toBeGreaterThan(0);
  expect(route.geometrySource).toBe("osm-local");
  expect(route.createdBy).toBe(school.drivers[0].userId);
  const joined = await req(
    "/journey/join",
    { schoolId: school.organization.id, name: "Aluno editor" },
    { user: "" },
  );
  const visitor = joined.headers.get("set-cookie")!.split(";")[0];
  const student = async () =>
    (await (
      await req("/journey/state", undefined, { user: "", cookie: visitor })
    ).json()) as { routes: { id: string }[] };
  expect((await student()).routes.some((r) => r.id === id)).toBe(false);
  expect(
    (await req(`/routes/${id}/visibility`, { published: true }, driver()))
      .status,
  ).toBe(403);
  expect(
    (await req(`/routes/${id}/visibility`, { published: true })).status,
  ).toBe(409);
  expect(
    (await req(`/routes/${id}/submit`, { version: 1 }, driver())).status,
  ).toBe(200);
  expect(
    (await req(`/routes/${id}`, draft, { ...driver(), method: "PUT" })).status,
  ).toBe(403);
  expect(
    (
      await req(`/routes/${id}/review`, {
        version: 1,
        decision: "rejected",
        note: "",
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await req(`/routes/${id}/review`, {
        version: 1,
        decision: "rejected",
        note: "Revisar destino na via.",
      })
    ).status,
  ).toBe(200);
  const changed = {
    ...draft,
    name: "Rota revisada",
    expectedVersion: 1,
    stops: [
      {
        ...stops[0],
        reference: {
          id: "node/1",
          name: "Referência de teste",
          source: "OpenStreetMap",
        },
      },
      stops[1],
    ],
  };
  expect(
    (await req(`/routes/${id}`, changed, { ...driver(), method: "PUT" }))
      .status,
  ).toBe(200);
  expect(
    (await req(`/routes/${id}`, changed, { ...driver(), method: "PUT" }))
      .status,
  ).toBe(409);
  expect(
    (await req(`/routes/${id}/submit`, { version: 2 }, driver())).status,
  ).toBe(200);
  expect(
    (await req(`/routes/${id}/review`, { version: 1, decision: "approved" }))
      .status,
  ).toBe(409);
  expect(
    (await req(`/routes/${id}/review`, { version: 2, decision: "approved" }))
      .status,
  ).toBe(200);
  expect((await student()).routes.some((r) => r.id === id)).toBe(false);
  expect(
    (await req(`/routes/${id}/visibility`, { published: true })).status,
  ).toBe(200);
  expect((await student()).routes.some((r) => r.id === id)).toBe(true);
  route = (await current()).routes.find((r) => r.id === id)!;
  expect(route.stops[0].reference?.name).toBe("Referência de teste");
  const versions = (await (await req(`/routes/${id}/versions`)).json()) as {
    snapshot: { name: string };
  }[];
  expect(versions).toHaveLength(2);
  expect(versions.find((v) => v.snapshot.name === draft.name)).toBeTruthy();
  expect((await req(`/routes/${id}/calculate`, {}, driver())).status).toBe(403);
});
it("nega edição de rascunho alheio, outra escola e publicação forçada", async () => {
  const foreign = (await (
    await req("/routes", draft, { user: "other-admin" })
  ).json()) as { id: string };
  expect(
    (await req(`/routes/${foreign.id}`, draft, { ...driver(), method: "PUT" }))
      .status,
  ).toBe(422);
  const created = (await (
    await req("/routes", draft, { cookie: driverCookie })
  ).json()) as { id: string };
  await DB.prepare("UPDATE routes SET created_by=? WHERE id=?")
    .bind("another-driver", created.id)
    .run();
  expect(
    (await req(`/routes/${created.id}`, draft, { ...driver(), method: "PUT" }))
      .status,
  ).toBe(403);
  const view = (await (
    await req("/state", undefined, driver())
  ).json()) as State;
  expect(view.routes.some((r) => r.id === created.id)).toBe(false);
  expect(
    (
      await req(
        "/routes",
        { ...draft, published: true, approval: "approved" },
        driver(),
      )
    ).status,
  ).toBe(422);
  await expect(
    DB.prepare("UPDATE routes SET published=1 WHERE id=?")
      .bind(created.id)
      .run(),
  ).rejects.toThrow();
  expect(other.organization.id).not.toBe(school.organization.id);
});
it("prévia e referências respeitam limites e funcionam sem resultados", async () => {
  expect((await req("/routes/preview", draft, driver())).status).toBe(200);
  const result = (await (
    await req(
      "/geo/pois?lat=-7.2185&lng=-35.8855&radius=1500",
      undefined,
      driver(),
    )
  ).json()) as PoiResult;
  expect(result.points.length).toBeGreaterThan(0);
  expect(result.points.length).toBeLessThanOrEqual(40);
  expect(
    result.points.every(
      (p) => p.source === "OpenStreetMap" && p.meters! <= 1500,
    ),
  ).toBe(true);
  const empty = (await (
    await req("/geo/pois?lat=0&lng=0&radius=1500", undefined, driver())
  ).json()) as PoiResult;
  expect(empty.points).toEqual([]);
  expect(
    (await req("/geo/pois?lat=91&lng=0", undefined, driver())).status,
  ).toBe(422);
  expect(
    (await req("/geo/pois?lat=0&lng=0&radius=999999", undefined, driver()))
      .status,
  ).toBe(422);
  expect(
    (await req("/geo/pois?lat=0&lng=0&category=__proto__", undefined, driver()))
      .status,
  ).toBe(422);
});
it("expiração e revogação do aparelho encerram acesso do editor", async () => {
  const code = (
    (await (
      await req("/driver/editor-link", {}, { user: "", token })
    ).json()) as { code: string }
  ).code;
  await DB.prepare("UPDATE access_sessions SET expires=? WHERE id=?")
    .bind(Date.now() - 1, await digest(code))
    .run();
  expect(
    (await req("/driver/web-exchange", { code }, { user: "" })).status,
  ).toBe(401);
  expect((await req("/driver/revoke", {}, { user: "", token })).status).toBe(
    200,
  );
  expect((await req("/state", undefined, driver())).status).toBe(401);
});
