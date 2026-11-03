import { describe, it, expect } from "vitest";
import {
  canTransition,
  validatePosition,
  estimateArrival,
  departure,
  project,
  distance,
  interpolate,
  type Itinerary,
  type Position,
} from "../../packages/domain";
import { routeSchema, vehicleSchema } from "../../packages/validation";
const now = 1800000000000;
const itinerary: Itinerary = {
  name: "Teste",
  routed: true,
  geometry: [
    [0, 0],
    [0, 0.01],
    [0.01, 0.01],
  ],
  stops: [
    { id: "a", name: "Origem", lat: 0, lng: 0, dwellSeconds: 30 },
    { id: "b", name: "Destino", lat: 0.01, lng: 0.01, dwellSeconds: 30 },
  ],
};
const p: Position = {
  lat: 0,
  lng: 0,
  accuracy: 5,
  timestamp: now,
  speed: 5,
  heading: 0,
  source: "gps",
};
describe("máquina de estados", () => {
  it("proíbe reabertura de encerradas e saltos inválidos", () => {
    expect(canTransition("scheduled", "completed")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("in_progress", "interrupted")).toBe(true);
    expect(canTransition("interrupted", "in_progress")).toBe(true);
  });
});
describe("integridade GPS", () => {
  it("rejeita coordenadas inválidas, baixa precisão, tempo futuro e antigo", () => {
    for (const value of [
      { ...p, lat: 91 },
      { ...p, accuracy: 101 },
      { ...p, timestamp: now + 20000 },
      { ...p, timestamp: now - 61000 },
    ])
      expect(validatePosition(value, null, now)).not.toBeNull();
  });
  it("rejeita repetição, excesso de frequência e teletransporte", () => {
    expect(validatePosition(p, p, now)).toMatch(/duplicada/);
    expect(
      validatePosition({ ...p, timestamp: now + 2000 }, p, now + 2000),
    ).toMatch(/Aguarde/);
    expect(
      validatePosition({ ...p, lat: 10, timestamp: now + 5000 }, p, now + 5000),
    ).toMatch(/anômalo/);
  });
  it("aceita deslocamento plausível", () =>
    expect(
      validatePosition(
        { ...p, lat: 0.0001, timestamp: now + 5000 },
        p,
        now + 5000,
      ),
    ).toBeNull());
});
describe("Smart Arrival / Departure", () => {
  const args = {
    position: p,
    itinerary,
    status: "in_progress" as const,
    delayUntil: null,
    waitUntil: null,
    now,
  };
  it("usa distância do itinerário, maior que linha reta", () => {
    const e = estimateArrival(args);
    expect(e.available).toBe(true);
    expect(e.meters).toBeGreaterThan(distance(p, itinerary.stops[1]));
    expect(e.minMinutes).toBeLessThan(e.maxMinutes!);
  });
  it("não anuncia ETA real para linha esquemática", () =>
    expect(
      estimateArrival({ ...args, itinerary: { ...itinerary, routed: false } })
        .available,
    ).toBe(false));
  it("identifica previsão simulada", () =>
    expect(
      estimateArrival({
        ...args,
        position: { ...p, source: "simulation" },
        itinerary: { ...itinerary, routed: false },
      }).simulated,
    ).toBe(true));
  it("não acumula atraso e espera simultâneos", () => {
    const base = estimateArrival(args),
      e = estimateArrival({
        ...args,
        delayUntil: now + 600000,
        waitUntil: now + 300000,
      });
    expect(e.maxMinutes! - base.maxMinutes!).toBeLessThanOrEqual(14);
  });
  it("recusa dados velhos e interrupção sem prazo", () => {
    expect(estimateArrival({ ...args, now: now + 61000 }).available).toBe(
      false,
    );
    expect(estimateArrival({ ...args, status: "interrupted" }).available).toBe(
      false,
    );
  });
  it("calcula margem do exemplo 15 - 8 - 3 = 4", () =>
    expect(departure(15, 8 * 60, 3)).toEqual({
      status: "on_time",
      minutes: 4,
    }));
  it("não recomenda correr quando tempo insuficiente", () => {
    expect(departure(5, 8 * 60).status).toBe("insufficient");
    expect(departure(null, 60).status).toBe("unavailable");
  });
  it("interpola e projeta no percurso", () => {
    const q = interpolate(itinerary.geometry, 500);
    expect(project(q, itinerary.geometry).along).toBeCloseTo(500, 0);
  });
});
describe("validação de cadastros", () => {
  it("rejeita duplicação de paradas e mass assignment", () => {
    expect(
      routeSchema.safeParse({
        name: "Rota",
        shift: "Manhã",
        stops: [itinerary.stops[0], itinerary.stops[0]],
      }).success,
    ).toBe(false);
    expect(
      vehicleSchema.safeParse({
        name: "Bus",
        plate: "DEM1A01",
        model: "Bus",
        year: 2025,
        capacity: 20,
        status: "available",
        orgId: "injected",
      }).success,
    ).toBe(false);
  });
});
