import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/d1";
import api, { type Bindings } from "../../apps/api";
import type { State } from "../../packages/shared/types";
import { expireGoogleGeometry } from "../../apps/api/geometry-retention";
let mf: Miniflare, DB: D1Database;
const stops = [
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
];
const google = {
  MAP_PROVIDER: "google",
  GOOGLE_MAPS_BROWSER_KEY: "test-browser-only",
  GOOGLE_MAPS_MAP_ID: "test-map-id",
  GOOGLE_ROUTES_KEY: "test-server-secret",
};
async function req(
  path: string,
  body?: unknown,
  provider: boolean | Partial<Bindings> = true,
) {
  return api.fetch(
    new Request("https://trackbus.test/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://trackbus.test",
        "Content-Type": "application/json",
        "oai-authenticated-user-id": "google-tests",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    {
      DB,
      ...(typeof provider === "object" ? provider : provider ? google : {}),
    },
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
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.unstubAllGlobals());
it("Demo Key de avaliação atende apenas instituições demonstrativas", async () => {
  const env = {
    MAP_PROVIDER: "google",
    GOOGLE_MAPS_MODE: "demo",
    GOOGLE_MAPS_DEMO_KEY: "test-demo-only",
    APP_ENV: "evaluation",
  };
  expect(
    await (await req("/maps/config", undefined, env)).json(),
  ).toMatchObject({
    provider: "google",
    demo: true,
  });
  await DB.prepare("UPDATE organizations SET demo=0").run();
  try {
    const send = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", send);
    const config = await (await req("/maps/config", undefined, env)).json();
    expect(config).toEqual({ provider: "maplibre", googlePending: true });
    const created = await req(
      "/routes",
      {
        name: "Instituição real sem Demo Key",
        shift: "Manhã",
        stops,
      },
      env,
    );
    expect(created.status).toBe(201);
    expect(send).not.toHaveBeenCalled();
  } finally {
    await DB.prepare("UPDATE organizations SET demo=1").run();
  }
});
it("contrato Google simulado somente no teste: salva coordenadas temporárias, não duração/distância do provedor", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 1000,
            duration: "200s",
            polyline: {
              geoJsonLinestring: {
                type: "LineString",
                coordinates: stops.map((s) => [s.lng, s.lat]),
              },
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", send);
  const response = await req("/routes", {
    name: "Google contratual",
    shift: "Manhã",
    stops,
  });
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as { id: string };
  const state = (await (await req("/state")).json()) as State,
    r = state.routes.find((r) => r.id === id)!;
  expect(r).toMatchObject({
    routed: true,
    geometrySource: "google",
    distanceMeters: null,
  });
  expect(r.geometryExpiresAt).toBeGreaterThan(Date.now());
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    JSON.stringify(await (await req("/maps/config")).json()),
  ).not.toContain("test-server-secret");
  await expireGoogleGeometry(drizzle(DB), Date.now() + 86400001);
  const expired = ((await (await req("/state")).json()) as State).routes.find(
    (r) => r.id === id,
  )!;
  expect(expired).toMatchObject({
    routed: false,
    geometrySource: "google-expired",
    geometryExpiresAt: null,
  });
  const version = await DB.prepare(
    "SELECT snapshot FROM route_versions WHERE route_id=?",
  )
    .bind(id)
    .first<{ snapshot: string }>();
  expect(JSON.parse(version!.snapshot).geometrySource).toBe("google-expired");
});
it("falha do provedor preserva rascunho honesto; desenho manual permanece no D1", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 429 })),
  );
  const unavailable = await req("/routes", {
    name: "Google indisponível",
    shift: "Manhã",
    stops,
  });
  expect(unavailable.status).toBe(201);
  const drawing = stops.map((s) => [s.lng, s.lat]);
  const drawn = await req(
    "/routes",
    { name: "Desenho manual", shift: "Manhã", stops, drawing },
    false,
  );
  expect(drawn.status).toBe(201);
  const { id } = (await drawn.json()) as { id: string };
  const r = ((await (await req("/state")).json()) as State).routes.find(
    (r) => r.id === id,
  )!;
  expect(r).toMatchObject({
    routed: false,
    geometrySource: "user-drawn",
    geometry: drawing,
    distanceMeters: null,
  });
});
