import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as s from "../../db/schema";
/** Open the presentation with no routes, trips or student records. */
export async function seedDemo(
  db: DrizzleD1Database,
  ownerId: string,
  name: string,
) {
  const orgId = crypto.randomUUID(),
    now = Date.now();
  await db.batch([
    db
      .insert(s.organizations)
      .values({
        id: orgId,
        name: "TrackBus · Apresentação",
        ownerId,
        demo: true,
        roomOpen: true,
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
      .values({
        id: orgId + ":vehicle-0",
        orgId,
        name: "Ônibus da apresentação",
        plate: "FEC0A01",
        model: "Veículo demonstrativo",
        year: 2026,
        capacity: 44,
        status: "available",
      }),
    db
      .insert(s.drivers)
      .values({
        id: orgId + ":driver-0",
        orgId,
        name: "Motorista da apresentação",
        contact: "",
        userId: orgId + ":driver-user-0",
        status: "active",
      }),
    db
      .insert(s.audit)
      .values({
        id: crypto.randomUUID(),
        orgId,
        actorId: ownerId,
        action: "presentation_opened_empty",
        entityId: orgId,
        createdAt: now,
      }),
  ]);
  return orgId;
}
