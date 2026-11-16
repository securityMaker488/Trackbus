import { z } from "zod";
import type { Point } from "../../packages/domain";
const responseSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.number().finite().nonnegative(),
        distance: z.number().finite().nonnegative(),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z
            .array(
              z.tuple([
                z.number().min(-180).max(180),
                z.number().min(-90).max(90),
              ]),
            )
            .min(2)
            .max(20000),
        }),
      }),
    )
    .min(1),
});
const nominatimResultSchema = z.object({
  place_id: z.number(),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
  type: z.string(),
  importance: z.number().optional(),
});
const nominatimResponseSchema = z.array(nominatimResultSchema);

/** Free geocoding via Nominatim (OSM). Rate-limited by client and result-count. */
export async function searchPlaces(
  query: string,
  limit = 10,
  transport: typeof fetch = fetch,
): Promise<
  { id: number; name: string; lat: number; lng: number; type: string }[]
> {
  if (!query.trim() || query.trim().length < 2) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("accept-language", "pt-BR");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("namedetails", "0");
  url.searchParams.set("extratags", "0");
  url.searchParams.set("polygon_geojson", "0");
  const response = await transport(url, {
    headers: {
      "User-Agent": "TrackBus/0.1 (institutional route planner; https://trackbus.app)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 200_000) return [];
  const parsed = nominatimResponseSchema.safeParse(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({
    id: r.place_id,
    name: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    type: r.type,
  }));
}
export async function calculateRoute(
  endpoint: string,
  points: Point[],
  costing: "bus" | "pedestrian",
  transport: typeof fetch = fetch,
) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:")
    throw Error("O provedor de trajetos exige HTTPS");
  url.pathname = "/route";
  const response = await transport(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "TrackBus/0.1 (institutional route planner)",
    },
    body: JSON.stringify({
      locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
      costing,
      format: "osrm",
      shape_format: "geojson",
      units: "kilometers",
      language: "pt-BR",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("Serviço de trajetos indisponível");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2_000_000)
    throw Error("Resposta geográfica muito grande");
  const parsed = responseSchema.safeParse(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (!parsed.success) throw Error("Resposta geográfica inválida");
  const r = parsed.data.routes[0];
  return {
    seconds: r.duration,
    meters: r.distance,
    geometry: r.geometry.coordinates,
  };
}
