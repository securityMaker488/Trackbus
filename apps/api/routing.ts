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
const photonResultSchema = z.object({
  osm_id: z.number(),
  osm_type: z.string(),
  name: z.string(),
  country: z.string(),
  state: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  lon: z.number(),
  lat: z.number(),
  type: z.string(),
});
const photonResponseSchema = z.object({
  features: z.array(photonResultSchema),
});

/**
 * Global rate limiter via KV (1 req/s per key, 10 req/min per key).
 * Works across all Worker instances because KV is a shared, strongly-consistent store.
 */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
async function globalRateLimit(
  kv: { get: (key: string) => Promise<string | null>; put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void> },
  key: string,
): Promise<void> {
  const now = Date.now();
  const windowKey = `rl:${key}:${Math.floor(now / 1000)}`;
  const count = parseInt((await kv.get(windowKey)) || "0", 10);
  if (count >= 1) {
    const windowStart = Math.floor(now / 1000);
    let totalInWindow = count;
    for (let i = 1; i < RATE_LIMIT_WINDOW_SEC; i++) {
      const k = `rl:${key}:${windowStart - i}`;
      const v = parseInt((await kv.get(k)) || "0", 10);
      totalInWindow += v;
      if (totalInWindow >= RATE_LIMIT_MAX_PER_WINDOW) {
        throw Error("Limite de busca geográfica atingido. Tente mais tarde.");
      }
    }
    return;
  }
  await kv.put(windowKey, "1", { expirationTtl: RATE_LIMIT_WINDOW_SEC });
}
/** Free geocoding via Photon (OSM). Autocomplete-capable, rate-limited globally via KV. */
export async function searchPlaces(
  query: string,
  limit = 10,
  transport: typeof fetch = fetch,
  kv?: { get: (key: string) => Promise<string | null>; put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void> },
): Promise<
  { id: string; name: string; lat: number; lng: number; type: string }[]
> {
  if (!query.trim() || query.trim().length < 2) return [];
  if (kv) await globalRateLimit(kv, "searchPlaces");
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  url.searchParams.set("lang", "pt");
  const response = await transport(url, {
    headers: {
      "User-Agent": "TrackBus/0.1 (institutional route planner; https://trackbus.app)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
    redirect: "manual",
  });
  if (!response.ok || response.type === "opaqueredirect") return [];
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 200_000) return [];
  const parsed = photonResponseSchema.safeParse(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (!parsed.success) return [];
  return parsed.data.features.map((f) => ({
    id: `${f.osm_type}:${f.osm_id}`,
    name: [f.name, f.city, f.state, f.country].filter(Boolean).join(", "),
    lat: f.lat,
    lng: f.lon,
    type: f.type,
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
