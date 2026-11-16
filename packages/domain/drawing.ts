import { distance, project, type Point } from "./index";
/** Iterative RDP keeps endpoints and bounds work for touch input. */
export function simplifyDrawing(
  points: Point[],
  tolerance = 6,
): [number, number][] {
  if (points.length < 2) return [];
  const selected = new Set([0, points.length - 1]),
    stack: [[number, number]] | [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let far = tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = project(points[i], [
        [points[start].lng, points[start].lat],
        [points[end].lng, points[end].lat],
      ]).offset;
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index >= 0) {
      selected.add(index);
      stack.push([start, index], [index, end]);
    }
  }
  const result = [...selected]
    .sort((a, b) => a - b)
    .map((i) => [points[i].lng, points[i].lat] as [number, number]);
  return result.length > 1000 ? simplifyDrawing(points, tolerance * 2) : result;
}
export function appendDrawingPoint(points: Point[], p: Point) {
  if (points.length >= 3000) return points;
  return !points.length || distance(points.at(-1)!, p) >= 2
    ? [...points, p]
    : points;
}
