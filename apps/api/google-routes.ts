import { z } from "zod";
import type { Point } from "../../packages/domain";
const coordinate = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const responseSchema = z.object({
  routes: z
    .array(
      z.object({
        distanceMeters: z.number().nonnegative(),
        duration: z.string().regex(/^\d+(\.\d+)?s$/),
        polyline: z.object({
          geoJsonLinestring: z.object({
            type: z.literal("LineString"),
            coordinates: z.array(coordinate).min(2).max(4000),
          }),
        }),
      }),
    )
    .min(1),
});
/** Ephemeral response only. Never insert provider content into permanent route snapshots. */
export async function googleRoute(
  key: string,
  points: Point[],
  mode: "DRIVE" | "WALK",
) {
  if (points.length < 2 || points.length > 25)
    throw Error("Use entre 2 e 25 pontos por cálculo Google.");
  const waypoint = (p: Point) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  });
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring",
      },
      body: JSON.stringify({
        origin: waypoint(points[0]),
        destination: waypoint(points.at(-1)!),
        intermediates: points.slice(1, -1).map(waypoint),
        travelMode: mode,
        polylineEncoding: "GEO_JSON_LINESTRING",
        languageCode: "pt-BR",
        units: "METRIC",
        computeAlternativeRoutes: false,
      }),
    },
  );
  if (!response.ok)
    throw Error(
      response.status === 429
        ? "Limite do provedor atingido. Tente mais tarde."
        : "Roteamento Google temporariamente indisponível.",
    );
  const maxBytes = 256000;
  if (Number(response.headers.get("Content-Length") || 0) > maxBytes)
    throw Error("Resposta do provedor excedeu o limite.");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Resposta vazia do provedor.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw Error("Resposta do provedor excedeu o limite.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const route = responseSchema.parse(
    JSON.parse(new TextDecoder().decode(bytes)),
  ).routes[0];
  return {
    geometry: route.polyline.geoJsonLinestring.coordinates,
    meters: route.distanceMeters,
    seconds: Number(route.duration.slice(0, -1)),
    source: "google" as const,
    attribution: "Google Maps",
    warning:
      mode === "DRIVE"
        ? "Trajeto para veículos de passeio; conferir restrições do ônibus e segurança das paradas."
        : "Confira calçadas, travessias e condições locais.",
  };
}
