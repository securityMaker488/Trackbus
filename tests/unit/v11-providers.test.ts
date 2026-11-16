import { it, expect, vi, afterEach } from "vitest";
import { mapsConfig, googleRoutesKey } from "../../packages/shared/maps";
import { googleRoute } from "../../apps/api/google-routes";
import { smartPhase } from "../../apps/api/smart-alerts";
afterEach(() => vi.unstubAllGlobals());
it("Demo Key funciona apenas em desenvolvimento/avaliação e nunca em produção", () => {
  const demo = {
    MAP_PROVIDER: "google",
    GOOGLE_MAPS_MODE: "demo",
    GOOGLE_MAPS_DEMO_KEY: "test-demo",
  };
  for (const APP_ENV of [undefined, "production"]) {
    expect(mapsConfig({ ...demo, APP_ENV }).provider).toBe("maplibre");
    expect(googleRoutesKey({ ...demo, APP_ENV })).toBeUndefined();
  }
  for (const APP_ENV of ["development", "evaluation"]) {
    expect(mapsConfig({ ...demo, APP_ENV })).toEqual({
      provider: "google",
      browserKey: "test-demo",
      mapId: "DEMO_MAP_ID",
      demo: true,
    });
    expect(googleRoutesKey({ ...demo, APP_ENV })).toBe("test-demo");
  }
});
it("não ativa nem expõe credencial de servidor quando Google não foi configurado", () => {
  expect(mapsConfig({})).toEqual({
    provider: "maplibre",
    googlePending: false,
  });
  expect(mapsConfig({ MAP_PROVIDER: "google" })).toEqual({
    provider: "maplibre",
    googlePending: true,
  });
  const ready = mapsConfig({
    MAP_PROVIDER: "google",
    GOOGLE_MAPS_BROWSER_KEY: "browser",
    GOOGLE_MAPS_MAP_ID: "map-id",
    GOOGLE_ROUTES_KEY: "private",
  });
  expect(ready).toEqual({
    provider: "google",
    browserKey: "browser",
    mapId: "map-id",
  });
  expect(JSON.stringify(ready)).not.toContain("private");
});
it("usa Routes New com máscara mínima, HTTPS fixo e falha fechada nos limites", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 120,
            duration: "90s",
            polyline: {
              geoJsonLinestring: {
                type: "LineString",
                coordinates: [
                  [-35, -7],
                  [-35.001, -7.001],
                ],
              },
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", send);
  const points = [
    { lat: -7, lng: -35 },
    { lat: -7.001, lng: -35.001 },
  ];
  expect(await googleRoute("test", points, "WALK")).toMatchObject({
    seconds: 90,
    meters: 120,
    source: "google",
  });
  const request = send.mock.calls[0];
  expect(request[0]).toBe(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
  );
  expect(request[1]?.redirect).toBe("manual");
  expect(JSON.parse(request[1]?.body as string).travelMode).toBe("WALK");
  send.mockResolvedValue(new Response(null, { status: 429 }));
  await expect(googleRoute("test", points, "DRIVE")).rejects.toThrow("Limite");
  send.mockResolvedValue(new Response(" ".repeat(256001)));
  await expect(googleRoute("test", points, "DRIVE")).rejects.toThrow("excedeu");
  await expect(
    googleRoute("test", Array(26).fill(points[0]), "DRIVE"),
  ).rejects.toThrow("25");
});
it("distingue preparar, sair, margem insuficiente, desatualizada e parada passada", () => {
  expect(smartPhase(20, 420, 2, true, false)).toBeNull();
  expect(smartPhase(13, 420, 2, true, false)?.category).toBe("prepare");
  expect(smartPhase(10, 420, 2, true, false)?.category).toBe("leave");
  expect(smartPhase(5, 420, 2, true, false)?.category).toBe("late");
  expect(smartPhase(10, 420, 2, false, false)?.category).toBe("refresh");
  expect(smartPhase(null, 420, 2, true, false)).toBeNull();
  expect(smartPhase(10, 420, 2, true, true)?.category).toBe("passed");
});
