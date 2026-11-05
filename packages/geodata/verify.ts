import assert from "node:assert/strict";
import { calculateLocalRoute as route } from "./index";

const circuito = [
  { lat: -12.9978788, lng: -38.5130599 },
  { lat: -12.9990528, lng: -38.5110559 },
  { lat: -12.9967469, lng: -38.5076226 },
];
for (const mode of ["pedestrian", "bus"] as const) {
  const result = route(circuito, mode);
  assert(result, "O circuito demonstrativo precisa de cobertura");
  assert.equal(result.source, "osm-local");
  assert.equal(result.meters, 727);
  assert.equal(result.geometry.length, 48);
  assert.deepEqual(result.snapMeters, [0, 0, 0]);
  assert(result.seconds > 0);
}
const a = { lat: -12.9891041, lng: -38.5081797 },
  b = { lat: -12.9886991, lng: -38.5077412 };
assert.equal(route([a, b], "bus")?.meters, 67);
assert(
  (route([b, a], "bus")?.meters ?? 0) > 2000,
  "Sentido contrário exige desvio pela malha real",
);
assert.equal(route([circuito[0], { lat: 0, lng: 0 }], "pedestrian"), null);
assert.equal(
  route([circuito[0], { lat: Number.NaN, lng: 0 }], "pedestrian"),
  null,
);
assert.equal(
  route([circuito[0], { lat: -12.96902, lng: -38.51699 }], "pedestrian"),
  null,
);
assert.equal(route([circuito[0]], "bus"), null);
assert.equal(route([circuito[0], circuito[0]], "pedestrian")?.meters, 0);
console.log(
  "OK • circuito OSM local nos dois perfis, geometria, contramão, fora de cobertura, afastamento, entradas inválidas e coincidência.",
);
