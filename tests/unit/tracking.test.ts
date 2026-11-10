import { describe, it, expect } from "vitest";
import {
  trackJourney,
  visibleProgress,
  splitItinerary,
  type TrackingProgress,
} from "../../packages/domain/tracking";
import {
  distance,
  interpolate,
  type Itinerary,
  type Position,
} from "../../packages/domain";
const route: Itinerary = {
  name: "Circuito de teste",
  routed: true,
  geometry: [
    [0, 0],
    [0, 0.01],
    [0.01, 0.01],
  ],
  stops: [
    { id: "end", name: "Destino", lat: 0.01, lng: 0.01, dwellSeconds: 30 },
  ],
};
const point = (
  meters: number,
  timestamp: number,
  speed: number | null = 0,
  accuracy = 5,
): Position => ({
  ...interpolate(route.geometry, meters),
  timestamp,
  speed,
  accuracy,
  heading: null,
  source: "gps",
});
describe("progresso observado e permanência na parada", () => {
  it("não apresenta espera antiga ou encerrada como atual", () => {
    const p = point(9999, 1000),
      observed = {
        ...trackJourney(route, p, null, null, "in_progress"),
        waiting: true,
      };
    expect(visibleProgress(observed, "in_progress", 61001)?.waiting).toBe(
      false,
    );
    expect(visibleProgress(observed, "interrupted", 1001)?.waiting).toBe(false);
    expect(visibleProgress(observed, "completed", 1001)?.waiting).toBe(false);
    expect(visibleProgress(observed, "in_progress", 1001)?.waiting).toBe(true);
  });
  it("consome somente o percurso confirmado e não retrocede por oscilação", () => {
    const p = point(100, 1000, 4),
      a = trackJourney(route, p, null, null, "in_progress");
    const q = point(180, 21000, 4),
      b = trackJourney(route, q, p, a, "in_progress");
    expect(a.alongMeters).toBeCloseTo(100);
    expect(b.alongMeters).toBeCloseTo(180);
    expect(
      trackJourney(route, point(170, 26000), q, b, "in_progress").alongMeters,
    ).toBeCloseTo(180);
  });
  it("mantém progresso anterior fora da rota, com baixa precisão ou salto impossível", () => {
    const p = point(100, 1000),
      a = trackJourney(route, p, null, null, "in_progress");
    for (const q of [
      { ...point(500, 6000), lng: 0.1 },
      point(500, 6000, 0, 80),
      point(2000, 6000),
    ]) {
      const b = trackJourney(route, q, p, a, "in_progress");
      expect(b.reliable).toBe(false);
      expect(b.alongMeters).toBe(a.alongMeters);
      expect(b.waiting).toBe(false);
    }
  });
  it("exige dois minutos completos com leituras contínuas; sair encerra a espera", () => {
    let previous: Position | null = null,
      progress: TrackingProgress | null = null;
    for (let elapsed = 0; elapsed <= 120000; elapsed += 5000) {
      const p = point(9999, elapsed + 1000);
      progress = trackJourney(route, p, previous, progress, "in_progress");
      expect(progress.waiting).toBe(elapsed === 120000);
      previous = p;
    }
    expect(progress?.stopId).toBe("end");
    expect(
      trackJourney(
        route,
        point(2200, 126000, 2),
        previous,
        progress,
        "in_progress",
      ).waiting,
    ).toBe(false);
  });
  it("reinicia confirmação após lacuna, erro de precisão ou afastamento da âncora", () => {
    const p = point(9999, 1000),
      a = trackJourney(route, p, null, null, "in_progress");
    const waiting = { ...a, waiting: true };
    for (const q of [
      point(9999, 121000),
      point(9999, 6000, 0, 31),
      point(2190, 6000),
    ]) {
      const b = trackJourney(route, q, p, waiting, "in_progress");
      expect(b.waiting).toBe(false);
      expect(b.stationarySince).not.toBe(1000);
    }
  });
  it("não confirma espera sem velocidade inicial nem em viagem interrompida", () => {
    const p = point(9999, 1000, null);
    expect(
      trackJourney(route, p, null, null, "in_progress").stationarySince,
    ).toBeNull();
    const a = trackJourney(
      route,
      { ...p, speed: 0 },
      null,
      null,
      "in_progress",
    );
    expect(
      trackJourney(route, point(9999, 6000), p, a, "interrupted")
        .stationarySince,
    ).toBeNull();
  });
  it("não inventa progresso viário no GPS de uma rota esquemática", () => {
    const p = point(100, 1000);
    expect(
      trackJourney({ ...route, routed: false }, p, null, null, "in_progress")
        .reliable,
    ).toBe(false);
    expect(
      trackJourney(
        { ...route, routed: false },
        { ...p, source: "simulation" },
        null,
        null,
        "in_progress",
      ).reliable,
    ).toBe(true);
  });
  it("divide o itinerário preservando suas curvas e o ponto de corte", () => {
    const first = distance({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 });
    const parts = splitItinerary(route.geometry, first + 100);
    expect(parts.completed.slice(0, 2)).toEqual(route.geometry.slice(0, 2));
    expect(parts.completed.at(-1)).toEqual(parts.remaining[0]);
    expect(parts.remaining.at(-1)).toEqual(route.geometry.at(-1));
    expect(splitItinerary([], 0).remaining).toEqual([]);
    expect(splitItinerary(route.geometry, 9999).remaining).toEqual([
      route.geometry.at(-1),
    ]);
    expect(splitItinerary(route.geometry, 0).remaining).toEqual(route.geometry);
  });
});
