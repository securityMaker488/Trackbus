import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { DB } from "./access";
import * as s from "../../db/schema";
import { calculateLocalRoute } from "../../packages/geodata";
export const presentationPoints = [
  {
    lat: -7.2227228,
    lng: -35.8774256,
    name: "Açude Velho · início do circuito",
  },
  {
    lat: -7.2249866,
    lng: -35.8807931,
    name: "Rua Doutor Severino Cruz · parada",
  },
  { lat: -7.2257942, lng: -35.8845174, name: "Açude Velho · fim do circuito" },
];
export async function preparePresentation(db: DB, orgId: string) {
  const geometry = calculateLocalRoute(presentationPoints, "bus");
  if (!geometry)
    throw new HTTPException(503, {
      message: "Circuito de demonstração indisponível",
    });
  for (const mode of ["gps", "simulation"] as const) {
    const prefix = orgId + ":congretech-pb-v6:" + mode,
      routeId = prefix + ":r",
      vehicleId = prefix + ":v",
      driverId = prefix + ":d",
      name =
        "Circuito Congretech · Campina Grande · " +
        (mode === "gps" ? "GPS real" : "Simulação"),
      stops = presentationPoints.map((p, i) => ({
        ...p,
        id: prefix + ":p" + i,
        dwellSeconds: 30,
      })),
      snapshot = { name, stops, geometry: geometry.geometry, routed: true };
    await db.batch([
      db
        .insert(s.routes)
        .values({
          ...snapshot,
          id: routeId,
          orgId,
          shift: "Manhã",
          published: true,
          description:
            "Circuito de apresentação no Açude Velho, Campina Grande/PB. Validar acesso e segurança presencialmente antes do ensaio.",
        })
        .onConflictDoNothing(),
      db
        .insert(s.routeVersions)
        .values({
          id: prefix + ":version1",
          orgId,
          routeId,
          version: 1,
          snapshot,
          createdAt: Date.now(),
        })
        .onConflictDoNothing(),
      db
        .insert(s.vehicles)
        .values({
          id: vehicleId,
          orgId,
          name: "TrackBus " + (mode === "gps" ? "Campo" : "Simulador"),
          plate: mode === "gps" ? "FEC6A01" : "FEC6A02",
          model: "Veículo demonstrativo",
          year: 2026,
          capacity: 30,
          status: "available",
        })
        .onConflictDoNothing(),
      db
        .insert(s.drivers)
        .values({
          id: driverId,
          orgId,
          name:
            mode === "gps"
              ? "Motorista da apresentação · Campina"
              : "Operador do simulador · Campina",
          userId: prefix + ":operator",
          status: "active",
        })
        .onConflictDoNothing(),
    ]);
    const [route] = await db
      .select()
      .from(s.routes)
      .where(and(eq(s.routes.id, routeId), eq(s.routes.orgId, orgId)));
    const trips = await db
      .select()
      .from(s.trips)
      .where(and(eq(s.trips.orgId, orgId), eq(s.trips.routeId, routeId)));
    if (!trips.some((t) => !["completed", "cancelled"].includes(t.status))) {
      const now = Date.now();
      await db
        .insert(s.trips)
        .values({
          id: prefix + ":trip" + (trips.length + 1),
          orgId,
          routeId,
          vehicleId,
          driverId,
          name,
          trackingMode: mode,
          plannedStart: now,
          plannedEnd: now + 3600000,
          snapshot: {
            name: route.name,
            stops: route.stops,
            geometry: route.geometry,
            routed: route.routed,
          },
        })
        .onConflictDoNothing();
    }
  }
  await db
    .update(s.organizations)
    .set({ roomOpen: true })
    .where(and(eq(s.organizations.id, orgId), eq(s.organizations.demo, true)));
}
