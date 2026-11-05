import { describe, it, expect } from "vitest";
import { calculateLocalRoute, localCoverage } from "../../packages/geodata";

const circuito = [
  { lat: -12.9978788, lng: -38.5130599 },
  { lat: -12.9990528, lng: -38.5110559 },
  { lat: -12.9967469, lng: -38.5076226 },
];

describe("malha viária local de Salvador (geodata)", () => {
  it("expõe metadados e atribuição ODbL do recorte", () => {
    expect(localCoverage.bbox).toEqual([-38.517, -13.005, -38.461, -12.969]);
    expect(localCoverage.attribution).toContain("OpenStreetMap");
  });

  it("calcula o circuito demonstrativo da Rua Caetano Moura nos perfis bus e pedestrian", () => {
    for (const mode of ["pedestrian", "bus"] as const) {
      const result = calculateLocalRoute(circuito, mode);
      expect(result).not.toBeNull();
      expect(result?.source).toBe("osm-local");
      expect(result?.meters).toBe(727);
      expect(result?.geometry).toHaveLength(48);
      expect(result?.snapMeters).toEqual([0, 0, 0]);
      expect(result?.seconds).toBeGreaterThan(0);
    }
  });

  it("respeita sentidos de via e restrições de contramão para ônibus", () => {
    const a = { lat: -12.9891041, lng: -38.5081797 };
    const b = { lat: -12.9886991, lng: -38.5077412 };
    expect(calculateLocalRoute([a, b], "bus")?.meters).toBe(67);
    expect(calculateLocalRoute([b, a], "bus")?.meters ?? 0).toBeGreaterThan(2000);
  });

  it("rejeita pontos fora da cobertura, afastados de vias ou inválidos", () => {
    expect(calculateLocalRoute([circuito[0], { lat: 0, lng: 0 }], "pedestrian")).toBeNull();
    expect(calculateLocalRoute([circuito[0], { lat: Number.NaN, lng: 0 }], "pedestrian")).toBeNull();
    expect(
      calculateLocalRoute([circuito[0], { lat: -12.96902, lng: -38.51699 }], "pedestrian"),
    ).toBeNull();
    expect(calculateLocalRoute([circuito[0]], "bus")).toBeNull();
    expect(calculateLocalRoute([circuito[0], circuito[0]], "pedestrian")?.meters).toBe(0);
  });
});
