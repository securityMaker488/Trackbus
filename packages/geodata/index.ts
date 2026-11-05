import snapshot from "./salvador.json";
import { distance, type Point } from "../domain";

type Mode = "bus" | "pedestrian";
type Coordinate = [number, number];
type Edge = {
  a: number;
  b: number;
  way: number;
  flags: number;
  meters: number;
};
type Network = {
  nodes: Point[];
  edges: Edge[];
  incident: number[][];
  restrictions: Map<number, number[][]>;
};
type Snap = { edge: Edge; fraction: number; point: Point; offset: number };
type Step = {
  node: number;
  priorNode: number;
  way: number;
  cost: number;
  parent?: Step;
};
let cached: Network | undefined;
export const localCoverage = {
  bbox: snapshot.bbox,
  date: snapshot.dataDate,
  attribution: snapshot.attribution,
};
export type LocalRoute = {
  seconds: number;
  meters: number;
  geometry: Coordinate[];
  source: "osm-local";
  snapMeters: number[];
};

function* integers(encoded: string) {
  const bytes = atob(encoded);
  let sum = 0,
    place = 1;
  for (let i = 0; i < bytes.length; i++) {
    const digit = bytes.charCodeAt(i);
    sum += (digit & 127) * place;
    if (digit >= 128) {
      place *= 128;
      continue;
    }
    yield sum;
    sum = 0;
    place = 1;
  }
}
const signed = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);
function getNetwork(): Network {
  if (cached) return cached;
  const nodes: Point[] = [],
    edges: Edge[] = [];
  const points = integers(snapshot.points),
    links = integers(snapshot.edges);
  const take = (source: Generator<number, void>) => {
    const next = source.next();
    if (next.done) throw Error("Grafo local incompleto");
    return next.value;
  };
  let x = 0,
    y = 0,
    last = 0;
  for (let i = 0; i < snapshot.nodes; i++) {
    x += signed(take(points));
    y += signed(take(points));
    nodes.push({ lng: x / 1e6, lat: y / 1e6 });
  }
  const incident: number[][] = nodes.map(() => []);
  for (let i = 0; i < snapshot.links; i++) {
    const a = last + signed(take(links)),
      b = a + signed(take(links)),
      way = take(links),
      flags = take(links);
    last = a;
    edges.push({ a, b, way, flags, meters: distance(nodes[a], nodes[b]) });
    incident[a].push(i);
    incident[b].push(i);
  }
  const restrictions = new Map<number, number[][]>();
  for (const rule of snapshot.rules) {
    const list = restrictions.get(rule[0]) || [];
    list.push(rule);
    restrictions.set(rule[0], list);
  }
  cached = { nodes, edges, incident, restrictions };
  return cached;
}
function inside(p: Point): boolean {
  const [west, south, east, north] = snapshot.bbox;
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= south &&
    p.lat <= north &&
    p.lng >= west &&
    p.lng <= east
  );
}
function directions(edge: Edge, mode: Mode) {
  return mode === "pedestrian" ? edge.flags & 3 : (edge.flags >> 2) & 3;
}
function snap(point: Point, network: Network, mode: Mode): Snap | undefined {
  let best: Snap | undefined;
  // A snap identifies the mapped segment. It never invents a connector through buildings or across a waterway.
  const limit = mode === "pedestrian" ? 35 : 45,
    scale = Math.cos((point.lat * Math.PI) / 180);
  for (const edge of network.edges) {
    if (!directions(edge, mode)) continue;
    const a = network.nodes[edge.a],
      b = network.nodes[edge.b];
    if (
      point.lat < Math.min(a.lat, b.lat) - 0.0005 ||
      point.lat > Math.max(a.lat, b.lat) + 0.0005 ||
      point.lng < Math.min(a.lng, b.lng) - 0.0005 ||
      point.lng > Math.max(a.lng, b.lng) + 0.0005
    )
      continue;
    const dx = (b.lng - a.lng) * scale,
      dy = b.lat - a.lat,
      len = dx * dx + dy * dy;
    if (!len) continue;
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((point.lng - a.lng) * scale * dx + (point.lat - a.lat) * dy) / len,
      ),
    );
    const snapped = {
        lat: a.lat + (b.lat - a.lat) * fraction,
        lng: a.lng + (b.lng - a.lng) * fraction,
      },
      offset = distance(point, snapped);
    if (offset <= limit && (!best || offset < best.offset))
      best = { edge, point: snapped, offset, fraction };
  }
  return best;
}
class Queue {
  private items: (Step & { priority: number })[] = [];
  push(state: Step, priority: number) {
    const value = { ...state, priority };
    const a = this.items;
    let i = a.length;
    a.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= value.priority) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = value;
  }
  pop(): Step | undefined {
    const a = this.items,
      head = a[0],
      tail = a.pop();
    if (!a.length || !tail) return head;
    let i = 0;
    while (2 * i + 1 < a.length) {
      let child = 2 * i + 1;
      if (child + 1 < a.length && a[child + 1].priority < a[child].priority)
        child++;
      if (tail.priority <= a[child].priority) break;
      a[i] = a[child];
      i = child;
    }
    a[i] = tail;
    return head;
  }
}
function permitted(
  net: Network,
  state: Step,
  nextWay: number,
  directionNode: number,
  mode: Mode,
) {
  if (mode !== "bus" || state.way < 0) return true;
  const rules = net.restrictions.get(state.node);
  if (!rules) return true;
  const from = rules.filter((r) => r[1] === state.way);
  if (
    from.some((r) => r[3] === 1) &&
    !from.some((r) => r[3] === 1 && r[2] === nextWay)
  )
    return false;
  return !from.some(
    (r) =>
      r[2] === nextWay &&
      (r[3] === 0 ||
        (r[3] === 2 &&
          (state.way !== nextWay || directionNode === state.priorNode))),
  );
}
const coord = (p: Point): Coordinate => [p.lng, p.lat];
type Approach = { priorNode: number; way: number };
type Leg = {
  geometry: Coordinate[];
  meters: number;
  arrivalFrom: Approach | null;
};
function leg(
  net: Network,
  start: Snap,
  end: Snap,
  mode: Mode,
  incoming: Approach | null,
): Leg | null {
  const { nodes, incident } = net,
    queue = new Queue(),
    best = new Map<string, number>();
  const startId = nodes.length,
    endId = nodes.length + 1;
  function blockedAtStart(toward: number) {
    if (mode !== "bus" || !incoming) return false;
    if (start.fraction > 0 && start.fraction < 1)
      return incoming.priorNode === toward;
    const vertex = start.fraction === 0 ? start.edge.a : start.edge.b;
    if (toward === vertex) return false;
    const entry: Step = { node: vertex, ...incoming, cost: 0 };
    return !permitted(net, entry, start.edge.way, toward, mode);
  }
  function key(s: Step) {
    return mode === "bus" && net.restrictions.has(s.node)
      ? s.node + "/" + s.way + "/" + s.priorNode
      : String(s.node);
  }
  function offer(s: Step) {
    const k = key(s);
    if (s.cost >= (best.get(k) ?? Infinity)) return;
    best.set(k, s.cost);
    const remaining = s.node === endId ? 0 : distance(nodes[s.node], end.point);
    queue.push(s, s.cost + remaining);
  }
  const root: Step = { node: startId, priorNode: -1, way: -1, cost: 0 };
  const first = directions(start.edge, mode);
  if ((first & 2 || start.fraction === 0) && !blockedAtStart(start.edge.a))
    offer({
      node: start.edge.a,
      priorNode:
        start.fraction === 0 ? (incoming?.priorNode ?? -1) : start.edge.b,
      way: start.fraction === 0 ? (incoming?.way ?? -1) : start.edge.way,
      cost: start.fraction * start.edge.meters,
      parent: root,
    });
  if ((first & 1 || start.fraction === 1) && !blockedAtStart(start.edge.b))
    offer({
      node: start.edge.b,
      priorNode:
        start.fraction === 1 ? (incoming?.priorNode ?? -1) : start.edge.a,
      way: start.fraction === 1 ? (incoming?.way ?? -1) : start.edge.way,
      cost: (1 - start.fraction) * start.edge.meters,
      parent: root,
    });
  if (start.edge === end.edge) {
    const diff = end.fraction - start.fraction;
    if (
      diff === 0 ||
      (diff > 0 && first & 1 && !blockedAtStart(start.edge.b)) ||
      (diff < 0 && first & 2 && !blockedAtStart(start.edge.a))
    )
      return {
        geometry: [coord(start.point), coord(end.point)],
        meters: Math.abs(diff) * start.edge.meters,
        arrivalFrom:
          diff === 0
            ? incoming
            : {
                priorNode: diff > 0 ? start.edge.a : start.edge.b,
                way: start.edge.way,
              },
      };
  }
  const finish = directions(end.edge, mode);
  let state: Step | undefined;
  while ((state = queue.pop())) {
    if (state.cost !== best.get(key(state))) continue;
    if (state.node === endId) {
      const geometry: Coordinate[] = [],
        meters = state.cost,
        arrivalFrom = { priorNode: state.priorNode, way: state.way };
      let step: Step | undefined = state;
      while (step) {
        geometry.push(
          coord(
            step.node === startId
              ? start.point
              : step.node === endId
                ? end.point
                : nodes[step.node],
          ),
        );
        step = step.parent;
      }
      geometry.reverse();
      return { geometry, meters, arrivalFrom };
    }
    const isA = state.node === end.edge.a,
      isB = state.node === end.edge.b;
    const tail = isA ? end.fraction : isB ? 1 - end.fraction : Infinity;
    if (
      ((isA && (finish & 1 || tail === 0)) ||
        (isB && (finish & 2 || tail === 0))) &&
      (tail === 0 ||
        permitted(
          net,
          state,
          end.edge.way,
          isA ? end.edge.b : end.edge.a,
          mode,
        ))
    ) {
      offer({
        node: endId,
        priorNode: tail === 0 ? state.priorNode : state.node,
        way: tail === 0 ? state.way : end.edge.way,
        cost: state.cost + tail * end.edge.meters,
        parent: state,
      });
    }
    for (const index of incident[state.node]) {
      const edge = net.edges[index],
        forward = state.node === edge.a,
        next = forward ? edge.b : edge.a;
      if (
        !(directions(edge, mode) & (forward ? 1 : 2)) ||
        !permitted(net, state, edge.way, next, mode)
      )
        continue;
      offer({
        node: next,
        priorNode: state.node,
        way: edge.way,
        cost: state.cost + edge.meters,
        parent: state,
      });
    }
  }
  return null;
}
/** Returns only geometry along public mapped streets inside the fixed demo extract. */
export function calculateLocalRoute(
  points: Point[],
  mode: Mode,
): LocalRoute | null {
  if (points.length < 2 || points.length > 64 || !points.every(inside))
    return null;
  const net = getNetwork(),
    snaps = points.map((p) => snap(p, net, mode));
  if (snaps.some((p) => !p)) return null;
  let meters = 0,
    arrivalFrom: Approach | null = null;
  const geometry: Coordinate[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const step = leg(net, snaps[i - 1]!, snaps[i]!, mode, arrivalFrom);
    if (!step) return null;
    meters += step.meters;
    arrivalFrom = step.arrivalFrom;
    for (const p of step.geometry) {
      const last = geometry.at(-1);
      if (!last || last[0] !== p[0] || last[1] !== p[1]) geometry.push(p);
    }
  }
  if (geometry.length === 1) geometry.push(geometry[0]);
  return {
    source: "osm-local",
    meters: Math.round(meters),
    seconds: Math.ceil(meters / (mode === "pedestrian" ? 1.1 : 4.2)),
    geometry,
    snapMeters: snaps.map((s) => Math.round(s!.offset)),
  };
}
