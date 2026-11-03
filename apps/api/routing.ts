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
    redirect: "error",
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
