import data from "../../packages/geodata/paraiba-pois.json";
import { distance, type Point } from "../../packages/domain";
import type { Poi, PoiResult } from "../../packages/shared/pois";
/** Server-only index. The browser receives at most 40 references near the map. */
export function nearbyPois(
  center: Point,
  radius: number,
  category: string,
): PoiResult {
  const points = (data.points as Poi[])
    .filter((p) => category === "all" || p.category === category)
    .filter(
      (p) =>
        Math.abs(p.lat - center.lat) < radius / 110000 &&
        Math.abs(p.lng - center.lng) < radius / 105000,
    )
    .map((p) => ({ ...p, meters: Math.round(distance(center, p)) }))
    .filter((p) => p.meters <= radius)
    .sort((a, b) => a.meters - b.meters);
  return {
    points: points.slice(0, 40),
    truncated: points.length > 40,
    attribution: data.attribution,
    dataDate: data.dataDate,
    coverage: data.coverage,
  };
}
