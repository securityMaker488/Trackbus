import { it, expect, vi } from "vitest";
import { calculateRoute } from "../../apps/api/routing";
it("valida contrato Valhalla OSRM GeoJSON sem usar servidor público", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      routes: [
        {
          duration: 480,
          distance: 620,
          geometry: {
            type: "LineString",
            coordinates: [
              [-38, -13],
              [-38.01, -13.01],
            ],
          },
        },
      ],
    }),
  );
  const r = await calculateRoute(
    "https://routing.test",
    [
      { lat: -13, lng: -38 },
      { lat: -13.01, lng: -38.01 },
    ],
    "pedestrian",
    transport,
  );
  expect(r.seconds).toBe(480);
  expect(r.geometry).toHaveLength(2);
  const options = transport.mock.calls[0][1]!;
  const payload = JSON.parse(String(options.body));
  expect(payload.format).toBe("osrm");
  expect(payload.costing).toBe("pedestrian");
  expect(options.redirect).toBe("error");
});
it("rejeita HTTP e respostas inválidas", async () => {
  await expect(
    calculateRoute("http://routing.test", [], "bus"),
  ).rejects.toThrow("HTTPS");
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({
        routes: [
          {
            duration: 1,
            distance: 2,
            geometry: { type: "LineString", coordinates: [[999, 999]] },
          },
        ],
      }),
    );
  await expect(
    calculateRoute("https://routing.test", [], "bus", transport),
  ).rejects.toThrow("inválida");
});
