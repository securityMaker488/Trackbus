import {
  distance,
  project,
  interpolate,
  type Itinerary,
  type Point,
  type Position,
  type TripStatus,
} from "./index";
export type TrackingProgress = {
  alongMeters: number;
  totalMeters: number;
  observedAt: number;
  offRoute: boolean;
  reliable: boolean;
  stopId: string | null;
  stationarySince: number | null;
  anchor: Point | null;
  waiting: boolean;
};
export const STOP_DWELL_MS = 120000;
export function visibleProgress(
  progress: TrackingProgress | null | undefined,
  status: TripStatus | undefined,
  now: number,
): TrackingProgress | null {
  if (!progress) return null;
  const fresh = now - progress.observedAt <= 60000;
  return {
    ...progress,
    reliable: progress.reliable && fresh,
    waiting:
      progress.waiting &&
      fresh &&
      (status === "in_progress" || status === "paused"),
  };
}
/** Derived only from successive accepted fixes; no timer advances this state. */
export function trackJourney(
  route: Itinerary,
  p: Position,
  previous: Position | null,
  prior: TrackingProgress | null,
  status: TripStatus,
): TrackingProgress {
  const projected = project(p, route.geometry),
    gap = previous ? p.timestamp - previous.timestamp : 0;
  const offRoute = projected.offset > Math.max(60, p.accuracy * 2);
  const quality =
    p.accuracy <= 35 && (route.routed || p.source === "simulation");
  const delta = projected.along - (prior?.alongMeters ?? projected.along);
  const plausible =
    !previous ||
    gap > 60000 ||
    delta <= Math.max(30, (gap / 1000) * 45 + previous.accuracy + p.accuracy);
  const reliable =
    quality &&
    !offRoute &&
    plausible &&
    Number.isFinite(projected.total) &&
    projected.total > 0;
  const result: TrackingProgress = {
    alongMeters: Math.min(
      projected.total,
      Math.max(prior?.alongMeters ?? 0, reliable ? projected.along : 0),
    ),
    totalMeters: projected.total,
    observedAt: p.timestamp,
    offRoute,
    reliable,
    stopId: null,
    stationarySince: null,
    anchor: null,
    waiting: false,
  };
  if (
    !reliable ||
    p.accuracy > 30 ||
    !["in_progress", "paused"].includes(status)
  )
    return result;
  const stop = route.stops
    .map((s) => ({ s, d: distance(s, p) }))
    .filter((x) => x.d <= 40)
    .sort((a, b) => a.d - b.d)[0]?.s;
  const speed =
    p.speed ??
    (previous && gap > 0 && gap <= 30000
      ? distance(previous, p) / (gap / 1000)
      : null);
  if (!stop || speed === null || speed > 0.7) return result;
  const continuous = !!(
    prior?.stopId === stop.id &&
    prior.stationarySince !== null &&
    prior.anchor &&
    previous &&
    gap > 0 &&
    gap <= 30000 &&
    distance(prior.anchor, p) <= 20
  );
  result.stopId = stop.id;
  result.stationarySince = continuous ? prior!.stationarySince : p.timestamp;
  result.anchor = continuous ? prior!.anchor : { lat: p.lat, lng: p.lng };
  result.waiting = p.timestamp - result.stationarySince! >= STOP_DWELL_MS;
  return result;
}
export function splitItinerary(geometry: [number, number][], meters: number) {
  if (geometry.length < 2)
    return { completed: [] as [number, number][], remaining: geometry };
  const cut = interpolate(geometry, Math.max(0, meters)),
    point: [number, number] = [cut.lng, cut.lat];
  const completed: [number, number][] = [geometry[0]];
  let at = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1],
      b = geometry[i],
      length = distance({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
    if (at + length >= meters) {
      completed.push(point);
      return { completed, remaining: [point, ...geometry.slice(i)] };
    }
    completed.push(b);
    at += length;
  }
  return { completed: geometry, remaining: [geometry.at(-1)!] };
}
