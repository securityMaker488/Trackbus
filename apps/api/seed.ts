import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as s from "../../db/schema";
import type { Itinerary, Stop } from "../../packages/domain";
export async function seedDemo(
  db: DrizzleD1Database,
  ownerId: string,
  name: string,
) {
  const orgId = crypto.randomUUID(),
    now = Date.now(),
    id = (v: string) => `${orgId}:${v}`;
  const paths: [number, number][][] = [
    [
      [-38.501, -12.992],
      [-38.5, -12.99],
      [-38.497, -12.989],
      [-38.494, -12.986],
      [-38.492, -12.983],
      [-38.488, -12.982],
      [-38.485, -12.978],
      [-38.481, -12.974],
    ],
    [
      [-38.512, -12.984],
      [-38.508, -12.983],
      [-38.505, -12.98],
      [-38.5, -12.978],
      [-38.495, -12.977],
      [-38.488, -12.976],
      [-38.481, -12.974],
    ],
    [
      [-38.468, -13.0],
      [-38.467, -12.995],
      [-38.47, -12.99],
      [-38.473, -12.984],
      [-38.476, -12.978],
      [-38.481, -12.974],
    ],
  ];
  const routeNames = [
    "Rota 01 · Federação",
    "Rota 02 · Centro",
    "Rota 03 · Rio Vermelho",
  ];
  const stopNames = [
    [
      "Praça da Federação",
      "Alto das Pombas",
      "Jardim Apipema",
      "Colégio Horizonte",
    ],
    ["Campo Grande", "Canela", "Vale do Canela", "Colégio Horizonte"],
    [
      "Largo da Mariquita",
      "Rio Vermelho",
      "Engenho Velho",
      "Colégio Horizonte",
    ],
  ];
  const routes = paths.map((geometry, i) => {
    const selected = [0, 2, geometry.length - 3, geometry.length - 1];
    const stops: Stop[] = selected.map((at, j) => ({
      id: id(`stop-${i}-${j}`),
      name: stopNames[i][j],
      lng: geometry[at][0],
      lat: geometry[at][1],
      dwellSeconds: 45,
    }));
    return {
      id: id(`route-${i}`),
      orgId,
      name: routeNames[i],
      description:
        "Percurso fictício para demonstração. Traçado esquemático, sem validação viária.",
      shift: "Manhã",
      stops,
      geometry,
      routed: false,
      active: true,
      published: true,
      version: 1,
    };
  });
  const snapshots: Itinerary[] = routes.map((r) => ({
    name: r.name,
    stops: r.stops,
    geometry: r.geometry,
    routed: false,
  }));
  await db.batch([
    db
      .insert(s.organizations)
      .values({
        id: orgId,
        name: "Colégio Horizonte",
        ownerId,
        demo: true,
        roomOpen:true,
        createdAt: now,
      }),
    db
      .insert(s.memberships)
      .values({
        id: crypto.randomUUID(),
        orgId,
        userId: ownerId,
        name,
        role: "admin",
      }),
    db
      .insert(s.vehicles)
      .values(
        ["Horizonte 01", "Horizonte 02", "Horizonte 03", "Reserva 04"].map(
          (name, i) => ({
            id: id(`vehicle-${i}`),
            orgId,
            name,
            plate: `DEM${i}A0${i}`,
            model: i === 3 ? "Volare V8" : "Mercedes-Benz LO 916",
            year: 2023 + (i % 2),
            capacity: i === 3 ? 28 : 44,
            status: i === 3 ? "maintenance" : "available",
          }),
        ),
      ),
    db
      .insert(s.drivers)
      .values(
        ["Carlos Oliveira", "Marina Costa", "João Santos"].map((name, i) => ({
          id: id(`driver-${i}`),
          orgId,
          name,
          contact: "Contato fictício",
          userId: id(`driver-user-${i}`),
          status: "active",
        })),
      ),
    db.insert(s.routes).values(routes),
    db
      .insert(s.routeVersions)
      .values(
        routes.map((r, i) => ({
          id: crypto.randomUUID(),
          orgId,
          routeId: r.id,
          version: 1,
          snapshot: snapshots[i],
          createdAt: now,
        })),
      ),
    db
      .insert(s.students)
      .values(
        [
          "Ana Lima",
          "Lucas Souza",
          "Beatriz Costa",
          "Pedro Alves",
          "Julia Santos",
          "Rafael Silva",
          "Sofia Rocha",
          "Miguel Dias",
        ].map((name, i) => ({
          id: id(`student-${i}`),
          orgId,
          name,
          enrollment: `DEMO-00${i + 1}`,
          className: `${6 + (i % 3)}º ano`,
          shift: "Manhã",
          routeId: routes[i % 3].id,
          stopId: routes[i % 3].stops[1].id,
          userId: id(`student-user-${i}`),
          status: "active",
        })),
      ),
    db
      .insert(s.guardianLinks)
      .values({
        id: crypto.randomUUID(),
        orgId,
        studentId: id("student-0"),
        userId: id("guardian-user-0"),
        name: "Camila Lima · fictícia",
      }),
    db
      .insert(s.trips)
      .values(
        routes.map((r, i) => ({
          id: id(`trip-${i}`),
          orgId,
          name: `Ida · ${r.name}`,
          routeId: r.id,
          vehicleId: id(`vehicle-${i}`),
          driverId: id(`driver-${i}`),
          monitorId: id("monitor-user-0"),
          plannedStart: now + (i === 2 ? 3600000 : -600000),
          plannedEnd: now + 7200000,
          startedAt: i < 2 ? now - 600000 : null,
          status:
            i === 0
              ? ("in_progress" as const)
              : i === 1
                ? ("paused" as const)
                : ("scheduled" as const),
          trackingMode: i < 2 ? ("simulation" as const) : ("gps" as const),
          snapshot: snapshots[i],
        })),
      ),
    db
      .insert(s.locations)
      .values(
        routes
          .slice(0, 2)
          .map((r, i) => ({
            id: crypto.randomUUID(),
            orgId,
            tripId: id(`trip-${i}`),
            position: {
              lng: r.geometry[1][0],
              lat: r.geometry[1][1],
              accuracy: 5,
              timestamp: now,
              speed: 7,
              heading: 30,
              source: "simulation" as const,
            },
            updatedAt: now,
          })),
      ),
    db
      .insert(s.tripEvents)
      .values(
        routes
          .slice(0, 2)
          .map((r, i) => ({
            id: crypto.randomUUID(),
            orgId,
            tripId: id(`trip-${i}`),
            type: "demo_created",
            message: "Viagem fictícia preparada para demonstração",
            actorId: ownerId,
            simulated: true,
            createdAt: now,
          })),
      ),
    db
      .insert(s.notices)
      .values({
        id: crypto.randomUUID(),
        orgId,
        tripId: id("trip-0"),
        category: "information",
        message:
          "Bem-vindo à demonstração TrackBus. Todos os cadastros são fictícios e as posições iniciais são simuladas.",
        actorId: ownerId,
        simulated: true,
        createdAt: now,
      }),
    db
      .insert(s.maintenance)
      .values({
        id: crypto.randomUUID(),
        orgId,
        vehicleId: id("vehicle-3"),
        description: "Revisão preventiva · demonstração",
        kind: "preventive",
        date: new Date(now).toISOString().slice(0, 10),
        status: "open",
        costCents: 0,
      }),
    db
      .insert(s.audit)
      .values({
        id: crypto.randomUUID(),
        orgId,
        actorId: ownerId,
        action: "demo_created",
        entityId: orgId,
        createdAt: now,
      }),
  ]);
  return orgId;
}
