import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import api, { type Bindings } from "../../apps/api";
import type { State } from "../../packages/shared/types";
let mf: Miniflare, DB: D1Database;
const origin = "https://trackbus.test";
async function req(
  path: string,
  body?: unknown,
  user = "v7-admin",
  cookie = "",
  env: Partial<Bindings> = {},
  extra: Record<string, string> = {},
) {
  return api.fetch(
    new Request(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(user ? { "oai-authenticated-user-id": user } : {}),
        Cookie: cookie,
        ...extra,
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
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await mf?.dispose();
});
it("abre apresentação sem rotas e sem viagens pré-carregadas", async () => {
  expect((await req("/bootstrap", {})).status).toBe(201);
  const state = (await (await req("/state")).json()) as State;
  expect(state.routes).toEqual([]);
  expect(state.trips).toEqual([]);
  expect(state.students).toEqual([]);
  expect(state.locations).toEqual([]);
  expect(state.drivers[0].userId).toBeTruthy();
});
it("arquiva uma rota, preserva histórico e interrompe acesso de motorista e aluno", async () => {
  const before = (await (await req("/state")).json()) as State;
  const created = (await (
    await req("/routes", {
      name: "Rota ao vivo",
      shift: "Manhã",
      stops: [
        {
          id: "a",
          name: "Origem",
          lat: -7.2227228,
          lng: -35.8774256,
          dwellSeconds: 30,
        },
        {
          id: "b",
          name: "Destino",
          lat: -7.2257942,
          lng: -35.8845174,
          dwellSeconds: 30,
        },
      ],
    })
  ).json()) as { id: string };
  expect(
    (await req(`/routes/${created.id}/visibility`, { published: true })).status,
  ).toBe(200);
  const joined = await req(
      "/journey/join",
      { schoolId: before.organization.id, name: "Aluno teste" },
      "",
    ),
    cookie = joined.headers.get("set-cookie")!.split(";")[0];
  expect(
    (
      await req(
        "/journey/select",
        { routeId: created.id, stopId: "b", favorite: true, notify: true },
        "",
        cookie,
      )
    ).status,
  ).toBe(200);
  const t = (await (
    await req("/trips", {
      name: "Viagem ao vivo",
      routeId: created.id,
      vehicleId: before.vehicles[0].id,
      driverId: before.drivers[0].id,
      plannedStart: Date.now() - 1000,
      plannedEnd: Date.now() + 3600000,
      trackingMode: "gps",
    })
  ).json()) as { id: string };
  expect(
    (await req(`/trips/${t.id}/status`, { status: "in_progress" })).status,
  ).toBe(200);
  const pairing = (await (
    await req("/driver/pair", { driverId: before.drivers[0].id })
  ).json()) as { code: string };
  const device = (await (
    await req("/driver/exchange", { code: pairing.code }, "")
  ).json()) as { token: string };
  expect(device.token).toBeTruthy();
  const driverHeaders = { Authorization: `Bearer ${device.token}` };
  const assigned = (await (
    await req("/driver/trips", undefined, "", "", {}, driverHeaders)
  ).json()) as { id: string }[];
  expect(assigned.some((trip) => trip.id === t.id)).toBe(true);
  expect(
    (await req(`/routes/${created.id}/archive`, {}, "", cookie)).status,
  ).toBe(403);
  expect((await req(`/routes/${created.id}/archive`, {})).status).toBe(200);
  const after = (await (await req("/state")).json()) as State;
  expect(after.routes).toEqual([]);
  expect(after.trips).toEqual([]);
  expect(
    await (
      await req("/driver/trips", undefined, "", "", {}, driverHeaders)
    ).json(),
  ).toEqual([]);
  expect(
    (
      await req(
        `/trips/${t.id}/location`,
        {
          lat: -7.2227228,
          lng: -35.8774256,
          accuracy: 5,
          timestamp: Date.now(),
          speed: 0,
          source: "gps",
        },
        "",
        "",
        {},
        driverHeaders,
      )
    ).status,
  ).toBe(404);
  const student = (await (
    await req("/journey/state", undefined, "", cookie)
  ).json()) as { routes: unknown[]; preferences: unknown[] };
  expect(student.routes).toEqual([]);
  expect(student.preferences).toEqual([]);
  expect(
    await DB.prepare("SELECT archived_at FROM routes WHERE id=?")
      .bind(created.id)
      .first("archived_at"),
  ).toBeGreaterThan(0);
  expect(
    await DB.prepare("SELECT status FROM trips WHERE id=?")
      .bind(t.id)
      .first("status"),
  ).toBe("cancelled");
  expect(
    await DB.prepare(
      "SELECT COUNT(*) AS n FROM route_versions WHERE route_id=?",
    )
      .bind(created.id)
      .first("n"),
  ).toBe(1);
});
it("recusa header forjado no modo Cloudflare e mantém entrada restrita do aluno", async () => {
  const env = {
    AUTH_PROVIDER: "cloudflare-access" as const,
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "expected",
  };
  expect((await req("/state", undefined, "v7-admin", "", env)).status).toBe(
    401,
  );
  const state = (await (await req("/state")).json()) as State;
  expect(
    (
      await req(
        "/journey/join",
        { schoolId: state.organization.id, name: "Visitante" },
        "",
        "",
        env,
      )
    ).status,
  ).toBe(201);
});
it("somente o e-mail verificado do administrador inicial configura Cloudflare", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ keys: [{ ...jwk, kid: "bootstrap-key" }] }),
    ),
  );
  const encode = (x: unknown) =>
      Buffer.from(JSON.stringify(x)).toString("base64url"),
    now = Date.now() / 1000;
  const data =
    encode({ alg: "RS256", kid: "bootstrap-key" }) +
    "." +
    encode({
      iss: "https://bootstrap-test.cloudflareaccess.com",
      aud: ["expected"],
      type: "app",
      sub: "admin-verified",
      email: "owner@example.test",
      iat: now - 1,
      exp: now + 3600,
    });
  const jwt =
    data +
    "." +
    Buffer.from(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        pair.privateKey,
        new TextEncoder().encode(data),
      ),
    ).toString("base64url");
  const env = {
    AUTH_PROVIDER: "cloudflare-access" as const,
    ACCESS_TEAM_DOMAIN: "bootstrap-test.cloudflareaccess.com",
    ACCESS_AUD: "expected",
    INITIAL_ADMIN_EMAIL: "another@example.test",
  };
  try {
    expect(
      (
        await req("/bootstrap", {}, "forged", "", env, {
          "Cf-Access-Jwt-Assertion": jwt,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req(
          "/bootstrap",
          {},
          "forged",
          "",
          { ...env, INITIAL_ADMIN_EMAIL: "owner@example.test" },
          { "Cf-Access-Jwt-Assertion": jwt },
        )
      ).status,
    ).toBe(201);
    const row = await DB.prepare(
      "SELECT user_id FROM memberships WHERE user_id=?",
    )
      .bind("cf-access:admin-verified")
      .first();
    expect(row).not.toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
