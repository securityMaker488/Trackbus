import { it, expect } from "vitest";
import { simplifyDrawing } from "../../packages/domain/drawing";
import { routeSchema } from "../../packages/validation";
it("simplifica traço preservando extremidades e mudanças relevantes", () => {
  const line = Array.from({ length: 300 }, (_, i) => ({
    lng: -35.88 + i * 0.00001,
    lat: -7.22,
  }));
  expect(simplifyDrawing(line)).toEqual([
    [line[0].lng, line[0].lat],
    [line.at(-1)!.lng, line.at(-1)!.lat],
  ]);
  const curve = [
    line[0],
    { lng: -35.879, lat: -7.221 },
    { lng: -35.878, lat: -7.219 },
    line.at(-1)!,
  ];
  expect(simplifyDrawing(curve)).toHaveLength(4);
});
it("rejeita parada afastada e excesso de pontos sem declarar desenho roteado", () => {
  const stops = [
    { id: "a", name: "Origem", lat: -7.22, lng: -35.88, dwellSeconds: 30 },
    { id: "b", name: "Destino", lat: -7.221, lng: -35.879, dwellSeconds: 30 },
  ];
  const body = {
    name: "Desenho",
    shift: "Manhã",
    stops,
    drawing: [
      [-35.88, -7.22],
      [-35.879, -7.221],
    ],
  };
  expect(routeSchema.safeParse(body).success).toBe(true);
  expect(
    routeSchema.safeParse({
      ...body,
      stops: [stops[0], { ...stops[1], lat: 0 }],
    }).success,
  ).toBe(false);
  expect(
    routeSchema.safeParse({
      ...body,
      drawing: Array(1001).fill(body.drawing[0]),
    }).success,
  ).toBe(false);
});
