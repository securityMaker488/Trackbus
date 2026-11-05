export type Role = "admin" | "driver" | "student" | "guardian" | "monitor";
export type TripStatus =
  | "scheduled"
  | "in_progress"
  | "paused"
  | "interrupted"
  | "completed"
  | "cancelled";
export type Point = { lat: number; lng: number };
export type Stop = Point & { id: string; name: string; dwellSeconds: number };
export type Itinerary = {
  name: string;
  stops: Stop[];
  geometry: [number, number][];
  routed: boolean;
};
export type Position = Point & {
  accuracy: number;
  timestamp: number;
  speed: number | null;
  heading: number | null;
  source: "gps" | "simulation";
};
export const transitions: Record<TripStatus, TripStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["paused", "interrupted", "completed"],
  paused: ["in_progress", "interrupted", "completed"],
  interrupted: ["in_progress", "cancelled", "completed"],
  completed: [],
  cancelled: [],
};
export const canTransition = (from: TripStatus, to: TripStatus) =>
  transitions[from]?.includes(to) ?? false;
export function distance(a: Point, b: Point) {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) *
        Math.cos(b.lat * r) *
        Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function project(p: Point, g: [number, number][]) {
  let total = 0,
    best = { along: 0, offset: Infinity, total: 0 };
  const f = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1],
      [bx, by] = g[i],
      dx = (bx - ax) * f,
      dy = by - ay,
      t = Math.min(
        1,
        Math.max(
          0,
          ((p.lng - ax) * f * dx + (p.lat - ay) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      ),
      q = { lng: ax + (bx - ax) * t, lat: ay + (by - ay) * t },
      len = distance({ lng: ax, lat: ay }, { lng: bx, lat: by }),
      offset = distance(p, q);
    if (offset < best.offset)
      best = { along: total + len * t, offset, total: 0 };
    total += len;
  }
  return { ...best, total };
}
export function interpolate(g: [number, number][], meters: number): Point {
  if (!g.length) throw Error("Traçado vazio");
  for (let i = 1; i < g.length; i++) {
    const a = { lng: g[i - 1][0], lat: g[i - 1][1] },
      b = { lng: g[i][0], lat: g[i][1] },
      len = distance(a, b);
    if (meters <= len) {
      const t = Math.max(0, meters / (len || 1));
      return {
        lng: a.lng + (b.lng - a.lng) * t,
        lat: a.lat + (b.lat - a.lat) * t,
      };
    }
    meters -= len;
  }
  const p = g[g.length - 1];
  return { lng: p[0], lat: p[1] };
}
export function validatePosition(
  p: Position,
  previous: Position | null,
  now: number,
) {
  if (
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lng) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lng) > 180
  )
    return "Coordenadas inválidas";
  if (p.timestamp > now + 10000 || now - p.timestamp > 60000)
    return "Posição fora da janela de tempo";
  if (p.accuracy > 100 || p.accuracy < 0) return "Precisão insuficiente";
  if (previous && p.source === previous.source) {
    const dt = (p.timestamp - previous.timestamp) / 1000;
    if (dt <= 0) return "Posição duplicada ou fora de ordem";
    if (dt < 4) return "Aguarde antes de transmitir novamente";
    if (distance(previous, p) > dt * 45 + previous.accuracy + p.accuracy)
      return "Deslocamento anômalo";
  }
  return null;
}
export function estimateArrival(input: {
  position: Position | null;
  itinerary: Itinerary;
  stopId?: string;
  status: TripStatus;
  delayUntil: number | null;
  waitUntil: number | null;
  now: number;
}) {
  const { position: p, itinerary: r, now } = input;
  const no = (reason: string) => ({
    available: false as const,
    reason,
    minMinutes: null,
    maxMinutes: null,
    meters: null,
    simulated: p?.source === "simulation",
  });
  if (!p) return no("Posição do ônibus indisponível");
  if (now - p.timestamp > 60000) return no("Localização desatualizada");
  if (!["in_progress", "paused", "interrupted"].includes(input.status))
    return no("Viagem fora de operação");
  if(input.status==="paused"&&Math.max(input.waitUntil||0,input.delayUntil||0)<=now)return no("Viagem pausada sem previsão de retomada");
  if(input.status==="interrupted"&&(input.delayUntil||0)<=now)return no("Interrupção sem previsão atualizada");
  if (!r.routed && p.source !== "simulation")
    return no("Itinerário sobre vias ainda não validado");
  if (p.accuracy > 60 || !p.speed || p.speed < 1)
    return no("Velocidade ou precisão insuficientes");
  const at = project(p, r.geometry);
  if (at.offset > Math.max(100, p.accuracy * 3))
    return no("Posição afastada do itinerário");
  const stops = r.stops.map((s) => ({
      ...s,
      along: project(s, r.geometry).along,
    })),
    target = input.stopId
      ? stops.find((s) => s.id === input.stopId)
      : stops.find((s) => s.along > at.along + 30);
  if (!target || target.along < at.along - 30)
    return no("Parada já atendida ou fim do percurso");
  if (input.status === "interrupted" && !input.delayUntil)
    return no("Interrupção sem previsão");
  const meters = Math.max(0, target.along - at.along),
    dwell = stops
      .filter((s) => s.along > at.along && s.along < target.along)
      .reduce((a, s) => a + s.dwellSeconds, 0),
    hold = Math.max(
      0,
      ((input.delayUntil || 0) - now) / 1000,
      ((input.waitUntil || 0) - now) / 1000,
    ),
    seconds = meters / Math.min(22, p.speed) + dwell + hold;
  return {
    available: true as const,
    reason: null,
    minMinutes: Math.max(1, Math.floor((seconds * 0.8) / 60)),
    maxMinutes: Math.max(2, Math.ceil((seconds * 1.3) / 60)),
    meters: Math.round(meters),
    simulated: p.source === "simulation",
  };
}
export function departure(
  etaMin: number | null,
  walkingSeconds: number | null,
  marginMinutes = 3,
) {
  if (etaMin === null || walkingSeconds === null)
    return { status: "unavailable", minutes: null };
  const minutes = Math.floor(etaMin - walkingSeconds / 60 - marginMinutes);
  return {
    status:
      minutes > 3 ? "on_time" : minutes >= 0 ? "leave_now" : "insufficient",
    minutes,
  };
}
export const overlaps = (a: number, b: number, c: number, d: number) =>
  a < d && c < b;
