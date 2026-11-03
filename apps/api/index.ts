import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, desc, lt, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "../../db/schema";
import * as v from "../../packages/validation";
import {
  canTransition,
  estimateArrival,
  validatePosition,
  interpolate,
  project,
  distance,
  departure,
  type Role,
  type Position,
} from "../../packages/domain";
import { seedDemo } from "./seed";
import { calculateRoute } from "./routing";

type Actor = {
  orgId: string;
  userId: string;
  ownerId: string;
  role: Role;
  name: string;
  demo: boolean;
};
export type Bindings = { DB: D1Database; VALHALLA_URL?: string };
type Env = {
  Bindings: Bindings;
  Variables: {
    db: DrizzleD1Database;
    actor: Actor;
    identity: string;
    requestId: string;
  };
};
type C = Context<Env>;
type Trip = typeof s.trips.$inferSelect;
const app = new Hono<Env>().basePath("/api");
function fail(
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
const uuid = () => crypto.randomUUID();
const sha = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const roles = (c: C, ...allowed: Role[]) => {
  if (!allowed.includes(c.get("actor").role))
    fail(403, "Seu perfil não permite esta ação");
};
const day = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
async function payload<T extends z.ZodTypeAny>(
  c: C,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    fail(400, "JSON inválido");
  }
  const p = schema.safeParse(body);
  if (!p.success)
    fail(
      422,
      p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
    );
  return p.data;
}
async function log(c: C, action: string, entityId: string) {
  const a = c.get("actor");
  await c
    .get("db")
    .insert(s.audit)
    .values({
      id: uuid(),
      orgId: a.orgId,
      actorId: a.userId,
      action,
      entityId,
      createdAt: Date.now(),
    });
}
async function event(
  c: C,
  tripId: string,
  type: string,
  message: string,
  simulated = false,
) {
  const a = c.get("actor");
  await c
    .get("db")
    .insert(s.tripEvents)
    .values({
      id: uuid(),
      orgId: a.orgId,
      actorId: a.userId,
      tripId,
      type,
      message,
      simulated,
      createdAt: Date.now(),
    });
}
async function myStudents(c: C) {
  const db = c.get("db"),
    a = c.get("actor");
  if (a.role === "student")
    return db
      .select()
      .from(s.students)
      .where(
        and(eq(s.students.orgId, a.orgId), eq(s.students.userId, a.userId)),
      );
  if (a.role === "guardian") {
    const links = await db
      .select()
      .from(s.guardianLinks)
      .where(
        and(
          eq(s.guardianLinks.orgId, a.orgId),
          eq(s.guardianLinks.userId, a.userId),
        ),
      );
    const ids = new Set(links.map((l) => l.studentId));
    return (
      await db.select().from(s.students).where(eq(s.students.orgId, a.orgId))
    ).filter((x) => ids.has(x.id));
  }
  return [];
}
async function allowedTrips(c: C) {
  const db = c.get("db"),
    a = c.get("actor"),
    all = await db
      .select()
      .from(s.trips)
      .where(eq(s.trips.orgId, a.orgId))
      .orderBy(desc(s.trips.plannedStart))
      .limit(500);
  if (a.role === "admin") return all;
  if (a.role === "monitor") return all.filter((t) => t.monitorId === a.userId);
  if (a.role === "driver") {
    const drivers = await db
      .select()
      .from(s.drivers)
      .where(and(eq(s.drivers.orgId, a.orgId), eq(s.drivers.userId, a.userId)));
    return all.filter((t) => drivers.some((d) => d.id === t.driverId));
  }
  const students = await myStudents(c);
  return all.filter((t) =>
    students.some((st) => st.routeId === t.routeId && st.status === "active"),
  );
}
async function getTrip(c: C, id: string, operate = false) {
  if (operate) roles(c, "admin", "driver");
  const trip = (await allowedTrips(c)).find((t) => t.id === id);
  if (!trip) fail(404, "Viagem não encontrada");
  return trip;
}
async function revise(
  c: C,
  t: Trip,
  changes: Partial<typeof s.trips.$inferInsert>,
) {
  const updated = await c
    .get("db")
    .update(s.trips)
    .set({ ...changes, revision: t.revision + 1 })
    .where(
      and(
        eq(s.trips.id, t.id),
        eq(s.trips.orgId, t.orgId),
        eq(s.trips.revision, t.revision),
      ),
    )
    .returning();
  if (!updated.length)
    fail(
      409,
      "Viagem atualizada em outro dispositivo. Atualize e tente novamente.",
    );
  return updated[0];
}
async function routeRef(c: C, id: string) {
  const [r] = await c
    .get("db")
    .select()
    .from(s.routes)
    .where(and(eq(s.routes.id, id), eq(s.routes.orgId, c.get("actor").orgId)));
  if (!r) fail(422, "Rota inválida para esta instituição");
  return r;
}
async function vehicleRef(c: C, id: string) {
  const [r] = await c
    .get("db")
    .select()
    .from(s.vehicles)
    .where(
      and(eq(s.vehicles.id, id), eq(s.vehicles.orgId, c.get("actor").orgId)),
    );
  if (!r) fail(422, "Veículo inválido para esta instituição");
  return r;
}
app.use(
  "*",
  bodyLimit({
    maxSize: 65536,
    onError: (c) => c.json({ error: "Limite de payload excedido" }, 413),
  }),
);
app.use("*", async (c, next) => {
  const rid = uuid();
  c.set("requestId", rid);
  c.header("X-Request-ID", rid);
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    if (c.req.header("Origin") !== new URL(c.req.url).origin)
      fail(403, "Origem não autorizada");
    if (!c.req.header("Content-Type")?.startsWith("application/json"))
      fail(400, "Content-Type deve ser application/json");
  }
  if (!c.env.DB) fail(503, "Banco não configurado");
  c.set("db", drizzle(c.env.DB));
  await next();
});
app.get("/health", (c) => c.json({ service: "TrackBus", status: "ok" }));
app.use("*", async (c, next) => {
  const identity = c.req.header("oai-authenticated-user-id");
  if (!identity) fail(401, "Entre com sua conta para continuar");
  c.set("identity", identity);
  const db = c.get("db");
  const [m] = await db
    .select()
    .from(s.memberships)
    .where(
      and(eq(s.memberships.userId, identity), eq(s.memberships.active, true)),
    );
  if (!m) {
    if (["/api/me", "/api/bootstrap"].includes(c.req.path)) {
      await next();
      return;
    }
    fail(403, "Conta sem vínculo institucional");
  }
  const [org] = await db
    .select()
    .from(s.organizations)
    .where(eq(s.organizations.id, m.orgId));
  if (!org) fail(403, "Instituição indisponível");
  let a: Actor = {
    orgId: m.orgId,
    userId: identity,
    ownerId: identity,
    role: m.role,
    name: m.name,
    demo: org.demo,
  };
  const token = getCookie(c, "tb_demo");
  if (token && org.demo && org.ownerId === identity) {
    const [session] = await db
      .select()
      .from(s.demoSessions)
      .where(
        and(
          eq(s.demoSessions.id, await sha(token)),
          eq(s.demoSessions.ownerId, identity),
          eq(s.demoSessions.orgId, org.id),
        ),
      );
    if (session && session.expires > Date.now())
      a = {
        ...a,
        role: session.role,
        userId: session.actorId,
        name: {
          admin: m.name,
          driver: "Carlos Oliveira",
          student: "Ana Lima",
          guardian: "Camila Lima",
          monitor: "Monitor demonstrativo",
        }[session.role],
      };
  }
  c.set("actor", a);
  if (c.req.method !== "GET") {
    const now = Date.now(),
      key = `${identity}:${Math.floor(now / 60000)}`;
    const [rate] = await db
      .insert(s.rateLimits)
      .values({ id: key, count: 1, expires: now + 86400000 })
      .onConflictDoUpdate({
        target: s.rateLimits.id,
        set: { count: sql`${s.rateLimits.count}+1` },
      })
      .returning();
    if (rate.count > 60) fail(429, "Muitas operações. Aguarde um minuto.");
  }
  await next();
});
app.get("/me", async (c) => {
  const a = c.get("actor");
  return c.json(
    a ? { actor: a } : { needsSetup: true, identity: c.get("identity") },
  );
});
app.post("/bootstrap", async (c) => {
  if (c.get("actor")) fail(409, "Instituição já configurada");
  const name =
    c.req.header("oai-authenticated-user-full-name") || "Administrador";
  await seedDemo(c.get("db"), c.get("identity"), name);
  return c.json({ ok: true }, 201);
});
app.post("/demo/profile", async (c) => {
  const a = c.get("actor"),
    db = c.get("db");
  const [org] = await db
    .select()
    .from(s.organizations)
    .where(eq(s.organizations.id, a.orgId));
  if (!org.demo || org.ownerId !== c.get("identity"))
    fail(403, "Troca de perfil exclusiva do proprietário da demonstração");
  const { role } = await payload(
    c,
    z
      .object({
        role: z.enum(["admin", "driver", "student", "guardian", "monitor"]),
      })
      .strict(),
  );
  const old = getCookie(c, "tb_demo");
  if (old)
    await db
      .delete(s.demoSessions)
      .where(eq(s.demoSessions.id, await sha(old)));
  if (role === "admin") {
    deleteCookie(c, "tb_demo", { path: "/" });
    return c.json({ ok: true });
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
    suffix = {
      driver: "driver-user-0",
      student: "student-user-0",
      guardian: "guardian-user-0",
      monitor: "monitor-user-0",
    }[role];
  await db
    .insert(s.demoSessions)
    .values({
      id: await sha(token),
      orgId: a.orgId,
      ownerId: c.get("identity"),
      role,
      actorId: `${a.orgId}:${suffix}`,
      expires: Date.now() + 3600000,
    });
  setCookie(c, "tb_demo", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 3600,
  });
  await log(c, "demo_profile_changed", role);
  return c.json({ ok: true });
});
app.post("/logout", async (c) => {
  const token = getCookie(c, "tb_demo");
  if (token)
    await c
      .get("db")
      .delete(s.demoSessions)
      .where(eq(s.demoSessions.id, await sha(token)));
  deleteCookie(c, "tb_demo", { path: "/" });
  return c.json({ ok: true });
});
app.get("/state", async (c) => {
  const db = c.get("db"),
    a = c.get("actor"),
    orgId = a.orgId,
    admin = a.role === "admin",
    ts = await allowedTrips(c),
    tripIds = new Set(ts.map((t) => t.id)),
    routeIds = new Set(ts.map((t) => t.routeId));
  const [
    org,
    vs,
    ds,
    rs,
    ss,
    ls,
    ns,
    is,
    es,
    bs,
    as,
    ms,
    xs,
    cs,
    logs,
    reads,
    links,
    members,
  ] = await Promise.all([
    db.select().from(s.organizations).where(eq(s.organizations.id, orgId)),
    db.select().from(s.vehicles).where(eq(s.vehicles.orgId, orgId)).limit(500),
    db.select().from(s.drivers).where(eq(s.drivers.orgId, orgId)).limit(500),
    db.select().from(s.routes).where(eq(s.routes.orgId, orgId)).limit(500),
    db.select().from(s.students).where(eq(s.students.orgId, orgId)).limit(500),
    db
      .select()
      .from(s.locations)
      .where(eq(s.locations.orgId, orgId))
      .limit(500),
    db
      .select()
      .from(s.notices)
      .where(eq(s.notices.orgId, orgId))
      .orderBy(desc(s.notices.createdAt))
      .limit(200),
    db
      .select()
      .from(s.incidents)
      .where(eq(s.incidents.orgId, orgId))
      .orderBy(desc(s.incidents.createdAt))
      .limit(200),
    db
      .select()
      .from(s.tripEvents)
      .where(eq(s.tripEvents.orgId, orgId))
      .orderBy(desc(s.tripEvents.createdAt))
      .limit(200),
    db.select().from(s.boarding).where(eq(s.boarding.orgId, orgId)).limit(500),
    db.select().from(s.absences).where(eq(s.absences.orgId, orgId)).limit(500),
    admin
      ? db
          .select()
          .from(s.maintenance)
          .where(eq(s.maintenance.orgId, orgId))
          .limit(500)
      : [],
    admin
      ? db
          .select()
          .from(s.expenses)
          .where(eq(s.expenses.orgId, orgId))
          .limit(500)
      : [],
    db.select().from(s.calendar).where(eq(s.calendar.orgId, orgId)).limit(500),
    admin
      ? db
          .select()
          .from(s.audit)
          .where(eq(s.audit.orgId, orgId))
          .orderBy(desc(s.audit.createdAt))
          .limit(100)
      : [],
    db
      .select()
      .from(s.readReceipts)
      .where(
        and(
          eq(s.readReceipts.orgId, orgId),
          eq(s.readReceipts.userId, a.userId),
        ),
      )
      .limit(500),
    admin
      ? db
          .select()
          .from(s.guardianLinks)
          .where(eq(s.guardianLinks.orgId, orgId))
      : [],
    admin
      ? db.select().from(s.memberships).where(eq(s.memberships.orgId, orgId))
      : [],
  ]);
  const own = await myStudents(c),
    visibleStudents = admin
      ? ss
      : a.role === "monitor"
        ? ss.filter((st) => routeIds.has(st.routeId))
        : own,
    studentIds = new Set(visibleStudents.map((st) => st.id));
  const visibleLocations = ls.filter((l) => tripIds.has(l.tripId));
  const estimates = ts.map((t) => ({
    tripId: t.id,
    ...estimateArrival({
      position:
        visibleLocations.find((l) => l.tripId === t.id)?.position || null,
      itinerary: t.snapshot,
      stopId: own.find((st) => st.routeId === t.routeId)?.stopId,
      status: t.status,
      delayUntil: t.delayUntil,
      waitUntil: t.waitUntil,
      now: Date.now(),
    }),
  }));
  return c.json({
    actor: a,
    organization: {
      id: org[0].id,
      name: org[0].name,
      demo: org[0].demo,
      maxWait: org[0].maxWait,
    },
    vehicles: admin
      ? vs
      : vs.filter((v) => ts.some((t) => t.vehicleId === v.id)),
    drivers: admin
      ? ds
      : ds
          .filter((d) => ts.some((t) => t.driverId === d.id))
          .map((d) => ({ ...d, contact: "", userId: null })),
    routes: admin ? rs : rs.filter((r) => routeIds.has(r.id)),
    students: visibleStudents,
    trips: ts,
    locations: visibleLocations,
    notices: ns
      .filter((n) => tripIds.has(n.tripId))
      .map((n) => ({ ...n, read: reads.some((r) => r.noticeId === n.id) })),
    incidents:
      admin || a.role === "driver" || a.role === "monitor"
        ? is.filter((i) => tripIds.has(i.tripId))
        : [],
    events: es.filter((e) => tripIds.has(e.tripId)),
    boarding: bs.filter(
      (b) => tripIds.has(b.tripId) && studentIds.has(b.studentId),
    ),
    absences: as.filter((x) => studentIds.has(x.studentId)),
    maintenance: ms,
    expenses: xs,
    calendar: cs,
    audit: logs,
    guardianLinks: links,
    memberships: members,
    estimates,
    serverTime: Date.now(),
    routingConfigured: Boolean(c.env.VALHALLA_URL),
  });
});

app.post("/vehicles", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.vehicleSchema),
    id = uuid();
  await c
    .get("db")
    .insert(s.vehicles)
    .values({ ...data, id, orgId: c.get("actor").orgId });
  await log(c, "vehicle_created", id);
  return c.json({ id }, 201);
});
app.put("/vehicles/:id", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.vehicleSchema),
    r = await vehicleRef(c, c.req.param("id"));
  const ts = await allowedTrips(c);
  if (
    data.status !== "available" &&
    ts.some(
      (t) =>
        t.vehicleId === r.id && !["completed", "cancelled"].includes(t.status),
    )
  )
    fail(409, "Veículo vinculado a viagem pendente");
  await c.get("db").update(s.vehicles).set(data).where(eq(s.vehicles.id, r.id));
  await log(c, "vehicle_updated", r.id);
  return c.json({ ok: true });
});
app.post("/drivers", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.driverSchema),
    id = uuid();
  await c
    .get("db")
    .insert(s.drivers)
    .values({ ...data, id, orgId: c.get("actor").orgId });
  await log(c, "driver_created", id);
  return c.json({ id }, 201);
});
app.put("/drivers/:id", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.driverSchema);
  const [d] = await c
    .get("db")
    .select()
    .from(s.drivers)
    .where(
      and(
        eq(s.drivers.id, c.req.param("id")),
        eq(s.drivers.orgId, c.get("actor").orgId),
      ),
    );
  if (!d) fail(404, "Motorista não encontrado");
  if (
    data.status === "inactive" &&
    (await allowedTrips(c)).some(
      (t) =>
        t.driverId === d.id && !["completed", "cancelled"].includes(t.status),
    )
  )
    fail(409, "Motorista com viagem pendente");
  await c.get("db").update(s.drivers).set(data).where(eq(s.drivers.id, d.id));
  await log(c, "driver_updated", d.id);
  return c.json({ ok: true });
});
app.post("/students", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.studentSchema),
    r = await routeRef(c, data.routeId);
  if (!r.stops.some((st) => st.id === data.stopId))
    fail(422, "Parada não pertence à rota");
  const id = uuid();
  await c
    .get("db")
    .insert(s.students)
    .values({ ...data, id, orgId: c.get("actor").orgId });
  await log(c, "student_created", id);
  return c.json({ id }, 201);
});
app.put("/students/:id", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.studentSchema),
    r = await routeRef(c, data.routeId);
  if (!r.stops.some((st) => st.id === data.stopId))
    fail(422, "Parada inválida");
  const changed = await c
    .get("db")
    .update(s.students)
    .set(data)
    .where(
      and(
        eq(s.students.id, c.req.param("id")),
        eq(s.students.orgId, c.get("actor").orgId),
      ),
    )
    .returning();
  if (!changed.length) fail(404, "Aluno não encontrado");
  await log(c, "student_updated", changed[0].id);
  return c.json({ ok: true });
});
app.post("/routes", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.routeSchema),
    id = uuid(),
    orgId = c.get("actor").orgId,
    geometry = data.stops.map((st) => [st.lng, st.lat] as [number, number]),
    snapshot = { name: data.name, stops: data.stops, geometry, routed: false };
  await c.get("db").batch([
    c
      .get("db")
      .insert(s.routes)
      .values({ ...data, id, orgId, geometry, routed: false }),
    c
      .get("db")
      .insert(s.routeVersions)
      .values({
        id: uuid(),
        orgId,
        routeId: id,
        version: 1,
        snapshot,
        createdAt: Date.now(),
      }),
  ]);
  await log(c, "route_created", id);
  return c.json({ id }, 201);
});
app.put("/routes/:id", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.routeSchema),
    r = await routeRef(c, c.req.param("id")),
    geometry = data.stops.map((st) => [st.lng, st.lat] as [number, number]);
  const assigned = await c
    .get("db")
    .select()
    .from(s.students)
    .where(and(eq(s.students.orgId, r.orgId), eq(s.students.routeId, r.id)));
  if (assigned.some((st) => !data.stops.some((p) => p.id === st.stopId)))
    fail(409, "Reatribua os alunos antes de remover uma parada vinculada");
  await c.get("db").batch([
    c
      .get("db")
      .update(s.routes)
      .set({ ...data, geometry, routed: false, version: r.version + 1 })
      .where(eq(s.routes.id, r.id)),
    c
      .get("db")
      .insert(s.routeVersions)
      .values({
        id: uuid(),
        orgId: r.orgId,
        routeId: r.id,
        version: r.version + 1,
        snapshot: {
          name: data.name,
          stops: data.stops,
          geometry,
          routed: false,
        },
        createdAt: Date.now(),
      }),
  ]);
  await log(c, "route_version_created", r.id);
  return c.json({ ok: true });
});
app.get("/routes/:id/versions", async (c) => {
  roles(c, "admin");
  const r = await routeRef(c, c.req.param("id"));
  return c.json(
    await c
      .get("db")
      .select()
      .from(s.routeVersions)
      .where(
        and(
          eq(s.routeVersions.routeId, r.id),
          eq(s.routeVersions.orgId, r.orgId),
        ),
      )
      .orderBy(desc(s.routeVersions.version)),
  );
});
app.post("/trips", async (c) => {
  roles(c, "admin");
  const data = await payload(c, v.tripSchema),
    r = await routeRef(c, data.routeId),
    vehicle = await vehicleRef(c, data.vehicleId),
    db = c.get("db"),
    a = c.get("actor");
  if (!r.active || vehicle.status !== "available")
    fail(409, "Rota ou veículo indisponível");
  const [driver] = await db
    .select()
    .from(s.drivers)
    .where(
      and(
        eq(s.drivers.id, data.driverId),
        eq(s.drivers.orgId, a.orgId),
        eq(s.drivers.status, "active"),
      ),
    );
  if (!driver) fail(422, "Motorista indisponível");
  const [holiday] = await db
    .select()
    .from(s.calendar)
    .where(
      and(
        eq(s.calendar.orgId, a.orgId),
        eq(s.calendar.date, day(data.plannedStart)),
        eq(s.calendar.suspended, true),
      ),
    );
  if (holiday) fail(409, "Transporte suspenso nesta data");
  const count = await db
    .select()
    .from(s.students)
    .where(
      and(
        eq(s.students.orgId, a.orgId),
        eq(s.students.routeId, r.id),
        eq(s.students.status, "active"),
      ),
    );
  if (count.length > vehicle.capacity)
    fail(409, "Capacidade do veículo insuficiente");
  const id = uuid();
  await db
    .insert(s.trips)
    .values({
      ...data,
      id,
      orgId: a.orgId,
      snapshot: {
        name: r.name,
        stops: r.stops,
        geometry: r.geometry,
        routed: r.routed,
      },
    });
  await event(c, id, "scheduled", "Viagem programada", a.demo);
  await log(c, "trip_created", id);
  return c.json({ id }, 201);
});
app.post("/trips/:id/status", async (c) => {
  const t = await getTrip(c, c.req.param("id"), true),
    { status } = await payload(
      c,
      z
        .object({
          status: z.enum([
            "scheduled",
            "in_progress",
            "paused",
            "interrupted",
            "completed",
            "cancelled",
          ]),
        })
        .strict(),
    );
  if (!canTransition(t.status, status))
    fail(409, "Transição de estado inválida");
  if (status === "cancelled" && c.get("actor").role !== "admin")
    fail(403, "Cancelamento requer administrador");
  if (status === "in_progress") {
    const vehicle = await vehicleRef(c, t.vehicleId);
    if (vehicle.status !== "available") fail(409, "Veículo indisponível");
  }
  await revise(c, t, {
    status,
    startedAt:
      status === "in_progress" && !t.startedAt ? Date.now() : t.startedAt,
    endedAt: ["completed", "cancelled"].includes(status) ? Date.now() : null,
    waitUntil: null,
    waitStopId: null,
    delayUntil: status === "in_progress" ? null : t.delayUntil,
  });
  await event(
    c,
    t.id,
    status,
    `Estado atualizado: ${status}`,
    c.get("actor").demo,
  );
  await log(c, "trip_state_changed", t.id);
  return c.json({ ok: true });
});
async function storePosition(c: C, t: Trip, p: Position, validate = true) {
  const db = c.get("db"),
    [old] = await db
      .select()
      .from(s.locations)
      .where(eq(s.locations.tripId, t.id));
  if (validate) {
    const error = validatePosition(p, old?.position || null, Date.now());
    if (error) fail(422, error);
  }
  await db
    .insert(s.locations)
    .values({
      id: uuid(),
      orgId: t.orgId,
      tripId: t.id,
      position: p,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: s.locations.tripId,
      set: { position: p, updatedAt: Date.now() },
      setWhere: sql`json_extract(${s.locations.position}, '$.timestamp') < ${p.timestamp}`,
    });
  return p;
}
app.post("/trips/:id/location", async (c) => {
  const t = await getTrip(c, c.req.param("id"), true);
  if (!["in_progress", "paused", "interrupted"].includes(t.status))
    fail(409, "Viagem fora de operação");
  const p = await payload(c, v.positionSchema);
  if (p.source !== "gps") fail(422, "Use o simulador para posições simuladas");
  if (c.get("actor").role !== "driver")
    fail(403, "GPS exige motorista atribuído");
  await storePosition(c, t, p);
  return c.json({ ok: true });
});
app.post("/trips/:id/simulate", async (c) => {
  roles(c, "admin");
  if (!c.get("actor").demo)
    fail(403, "Simulação exclusiva do ambiente fictício");
  const t = await getTrip(c, c.req.param("id"), true),
    { speed } = await payload(
      c,
      z.object({ speed: z.number().min(1).max(20) }).strict(),
    );
  if (t.status !== "in_progress")
    fail(409, "Inicie ou retome a viagem antes de simular");
  const [previous] = await c
    .get("db")
    .select()
    .from(s.locations)
    .where(eq(s.locations.tripId, t.id));
  const now = Date.now();
  if (previous && now - previous.updatedAt < 4500)
    fail(429, "Aguarde a próxima atualização");
  if ((t.waitUntil || 0) > now) fail(409, "Espera em andamento");
  const total = project(t.snapshot.stops[0], t.snapshot.geometry).total,
    progress = Math.min(total, t.simProgress + speed * 5),
    point = interpolate(t.snapshot.geometry, progress);
  await revise(c, t, { simProgress: progress });
  await storePosition(
    c,
    t,
    {
      ...point,
      accuracy: 5,
      timestamp: now,
      speed,
      heading: null,
      source: "simulation",
    },
    false,
  );
  return c.json({ ok: true, finished: progress >= total });
});
app.post("/trips/:id/wait", async (c) => {
  const t = await getTrip(c, c.req.param("id"), true),
    p = await payload(
      c,
      z
        .object({
          stopId: z.string(),
          seconds: z.number().int().min(0).max(300),
          safeStop: z.literal(true),
        })
        .strict(),
    );
  if (!["in_progress", "paused"].includes(t.status))
    fail(409, "Viagem fora de operação");
  const now = Date.now(),
    db = c.get("db"),
    [org] = await db
      .select()
      .from(s.organizations)
      .where(eq(s.organizations.id, t.orgId));
  if (p.seconds > org.maxWait)
    fail(422, "Tempo acima da política institucional");
  if (p.seconds > 0) {
    if (t.waitUntil && t.waitUntil > now)
      fail(409, "Uma espera já está em andamento");
    const previous = await db
      .select()
      .from(s.tripEvents)
      .where(
        and(
          eq(s.tripEvents.tripId, t.id),
          eq(s.tripEvents.type, `wait:${p.stopId}`),
        ),
      );
    if (previous.length) fail(409, "Espera já utilizada nesta parada");
    const stop = t.snapshot.stops.find((st) => st.id === p.stopId);
    if (!stop) fail(422, "Parada inválida");
    const [loc] = await db
      .select()
      .from(s.locations)
      .where(eq(s.locations.tripId, t.id));
    if (
      !loc ||
      now - loc.position.timestamp > 60000 ||
      distance(stop, loc.position) > 150
    )
      fail(409, "Confirme uma posição recente próxima à parada");
    await revise(c, t, {
      waitUntil: now + p.seconds * 1000,
      waitStopId: p.stopId,
    });
    await event(
      c,
      t.id,
      `wait:${p.stopId}`,
      `Espera autorizada de ${p.seconds / 60} minutos em ${stop.name}`,
      c.get("actor").demo,
    );
  } else {
    await revise(c, t, { waitUntil: null, waitStopId: null });
    await event(c, t.id, "wait_ended", "Espera encerrada", c.get("actor").demo);
  }
  return c.json({ ok: true });
});
app.post("/notices", async (c) => {
  roles(c, "admin", "driver");
  const p = await payload(c, v.noticeSchema),
    t = await getTrip(c, p.tripId, true),
    a = c.get("actor"),
    db = c.get("db");
  if (["completed", "cancelled"].includes(t.status))
    fail(409, "Viagem encerrada");
  if (p.simulated && !a.demo) fail(422, "Evento simulado fora da demonstração");
  const now = Date.now(),
    id = uuid();
  const interruption = ["mechanical", "interruption", "assistance"].includes(
    p.category,
  );
  if (interruption && t.status === "scheduled")
    fail(409, "Inicie a viagem antes de interromper");
  await revise(c, t, {
    delayUntil: p.delayMinutes
      ? now + p.delayMinutes * 60000
      : p.category === "resumed"
        ? null
        : t.delayUntil,
    status: interruption
      ? "interrupted"
      : p.category === "resumed" && ["interrupted", "paused"].includes(t.status)
        ? "in_progress"
        : t.status,
  });
  await db
    .insert(s.notices)
    .values({
      id,
      orgId: a.orgId,
      tripId: t.id,
      category: p.category,
      message: p.message,
      actorId: a.userId,
      simulated: p.simulated || a.demo,
      createdAt: now,
    });
  if (interruption)
    await db
      .insert(s.incidents)
      .values({
        id: uuid(),
        orgId: a.orgId,
        tripId: t.id,
        category: p.category,
        description: p.message,
        status: "open",
        actorId: a.userId,
        createdAt: now,
        simulated: p.simulated || a.demo,
      });
  await event(c, t.id, p.category, p.message, p.simulated || a.demo);
  await log(c, "notice_created", id);
  return c.json({ id }, 201);
});
app.post("/notices/:id/read", async (c) => {
  const ns = await c
    .get("db")
    .select()
    .from(s.notices)
    .where(
      and(
        eq(s.notices.id, c.req.param("id")),
        eq(s.notices.orgId, c.get("actor").orgId),
      ),
    );
  if (!ns[0]) fail(404, "Aviso não encontrado");
  await getTrip(c, ns[0].tripId);
  await c
    .get("db")
    .insert(s.readReceipts)
    .values({
      id: uuid(),
      orgId: ns[0].orgId,
      noticeId: ns[0].id,
      userId: c.get("actor").userId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
  return c.json({ ok: true });
});
app.post("/incidents/:id/resolve", async (c) => {
  roles(c, "admin", "driver");
  const { resolution } = await payload(
      c,
      z.object({ resolution: z.string().min(3).max(500) }).strict(),
    ),
    db = c.get("db");
  const [i] = await db
    .select()
    .from(s.incidents)
    .where(
      and(
        eq(s.incidents.id, c.req.param("id")),
        eq(s.incidents.orgId, c.get("actor").orgId),
      ),
    );
  if (!i) fail(404, "Ocorrência não encontrada");
  const t = await getTrip(c, i.tripId, true);
  if (i.status === "resolved") fail(409, "Ocorrência já resolvida");
  await db
    .update(s.incidents)
    .set({ status: "resolved", resolution, resolvedAt: Date.now() })
    .where(eq(s.incidents.id, i.id));
  const remaining = await db
    .select()
    .from(s.incidents)
    .where(and(eq(s.incidents.tripId, t.id), eq(s.incidents.status, "open")));
  if (!remaining.length && t.status === "interrupted")
    await revise(c, t, { status: "in_progress", delayUntil: null });
  await db
    .insert(s.notices)
    .values({
      id: uuid(),
      orgId: t.orgId,
      tripId: t.id,
      category: "resumed",
      message: remaining.length
        ? "Uma ocorrência foi resolvida; atendimento ainda em andamento."
        : "Ocorrência resolvida. O ônibus retomou a viagem.",
      actorId: c.get("actor").userId,
      simulated: i.simulated,
      createdAt: Date.now(),
    });
  await event(c, t.id, "incident_resolved", resolution, i.simulated);
  await log(c, "incident_resolved", i.id);
  return c.json({ ok: true });
});
app.post("/boarding", async (c) => {
  roles(c, "admin", "monitor");
  const p = await payload(
      c,
      z
        .object({
          tripId: z.string(),
          studentId: z.string(),
          stopId: z.string(),
          kind: z.enum(["board", "alight"]),
        })
        .strict(),
    ),
    t = await getTrip(c, p.tripId),
    db = c.get("db");
  if (!["in_progress", "paused"].includes(t.status))
    fail(409, "Viagem fora de operação");
  const [st] = await db
    .select()
    .from(s.students)
    .where(
      and(
        eq(s.students.id, p.studentId),
        eq(s.students.orgId, t.orgId),
        eq(s.students.routeId, t.routeId),
      ),
    );
  if (!st || !t.snapshot.stops.some((x) => x.id === p.stopId))
    fail(422, "Passageiro ou parada inválidos");
  if (p.kind === "alight") {
    const [before] = await db
      .select()
      .from(s.boarding)
      .where(
        and(
          eq(s.boarding.studentId, p.studentId),
          eq(s.boarding.tripId, t.id),
          eq(s.boarding.kind, "board"),
        ),
      );
    if (!before) fail(409, "Registre o embarque antes do desembarque");
  }
  const id = uuid();
  await db
    .insert(s.boarding)
    .values({
      ...p,
      id,
      orgId: t.orgId,
      actorId: c.get("actor").userId,
      createdAt: Date.now(),
    });
  await event(
    c,
    t.id,
    "boarding",
    `${p.kind === "board" ? "Embarque" : "Desembarque"} confirmado`,
    c.get("actor").demo,
  );
  await log(c, `boarding_${p.kind}`, id);
  return c.json({ id }, 201);
});
app.post("/absences", async (c) => {
  roles(c, "admin", "student", "guardian");
  const p = await payload(
      c,
      z
        .object({
          studentId: z.string(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          shift: z.enum(["Manhã", "Tarde", "Noite"]),
          active: z.boolean().default(true),
        })
        .strict(),
    ),
    a = c.get("actor"),
    db = c.get("db");
  const allowed =
    a.role === "admin"
      ? await db.select().from(s.students).where(eq(s.students.orgId, a.orgId))
      : await myStudents(c);
  if (!allowed.some((st) => st.id === p.studentId))
    fail(404, "Aluno não encontrado");
  if (p.date < day(Date.now())) fail(422, "Data já passou");
  await db
    .insert(s.absences)
    .values({ ...p, id: uuid(), orgId: a.orgId, actorId: a.userId })
    .onConflictDoUpdate({
      target: [s.absences.studentId, s.absences.date, s.absences.shift],
      set: { active: p.active, actorId: a.userId },
    });
  await log(c, "absence_updated", p.studentId);
  return c.json({ ok: true });
});
app.post("/maintenance", async (c) => {
  roles(c, "admin");
  const p = await payload(
      c,
      z
        .object({
          vehicleId: z.string(),
          description: z.string().min(3).max(500),
          kind: z.enum(["preventive", "corrective"]),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          costCents: z.number().int().min(0).max(100000000),
        })
        .strict(),
    ),
    vehicle = await vehicleRef(c, p.vehicleId),
    db = c.get("db");
  if (
    (await allowedTrips(c)).some(
      (t) =>
        t.vehicleId === vehicle.id &&
        !["completed", "cancelled"].includes(t.status),
    )
  )
    fail(409, "Reprograme as viagens antes da manutenção");
  const id = uuid();
  await db.batch([
    db
      .insert(s.maintenance)
      .values({ ...p, id, orgId: vehicle.orgId, status: "open" }),
    db
      .update(s.vehicles)
      .set({ status: "maintenance" })
      .where(eq(s.vehicles.id, vehicle.id)),
  ]);
  await log(c, "maintenance_created", id);
  return c.json({ id }, 201);
});
app.post("/maintenance/:id/complete", async (c) => {
  roles(c, "admin");
  const db = c.get("db"),
    [m] = await db
      .select()
      .from(s.maintenance)
      .where(
        and(
          eq(s.maintenance.id, c.req.param("id")),
          eq(s.maintenance.orgId, c.get("actor").orgId),
        ),
      );
  if (!m) fail(404, "Manutenção não encontrada");
  await db
    .update(s.maintenance)
    .set({ status: "completed" })
    .where(eq(s.maintenance.id, m.id));
  const remaining = await db
    .select()
    .from(s.maintenance)
    .where(
      and(
        eq(s.maintenance.vehicleId, m.vehicleId),
        eq(s.maintenance.status, "open"),
      ),
    );
  if (!remaining.length)
    await db
      .update(s.vehicles)
      .set({ status: "available" })
      .where(eq(s.vehicles.id, m.vehicleId));
  await log(c, "maintenance_completed", m.id);
  return c.json({ ok: true });
});
app.post("/expenses", async (c) => {
  roles(c, "admin");
  const p = await payload(
    c,
    z
      .object({
        vehicleId: z.string(),
        routeId: z.string().nullable().default(null),
        category: z.enum(["fuel", "maintenance", "service", "other"]),
        description: z.string().min(3).max(500),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountCents: z.number().int().min(1).max(100000000),
      })
      .strict(),
  );
  await vehicleRef(c, p.vehicleId);
  if (p.routeId) await routeRef(c, p.routeId);
  const id = uuid();
  await c
    .get("db")
    .insert(s.expenses)
    .values({ ...p, id, orgId: c.get("actor").orgId });
  await log(c, "expense_created", id);
  return c.json({ id }, 201);
});
app.post("/calendar", async (c) => {
  roles(c, "admin");
  const p = await payload(
    c,
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().min(3).max(100),
        suspended: z.boolean(),
      })
      .strict(),
  );
  if (
    p.suspended &&
    (await allowedTrips(c)).some(
      (t) =>
        day(t.plannedStart) === p.date &&
        !["cancelled", "completed"].includes(t.status),
    )
  )
    fail(409, "Reprograme ou cancele as viagens deste dia primeiro");
  await c
    .get("db")
    .insert(s.calendar)
    .values({ ...p, id: uuid(), orgId: c.get("actor").orgId })
    .onConflictDoUpdate({
      target: [s.calendar.orgId, s.calendar.date],
      set: p,
    });
  await log(c, "calendar_updated", p.date);
  return c.json({ ok: true });
});
app.post("/memberships", async (c) => {
  roles(c, "admin");
  const p = await payload(
    c,
    z
      .object({
        userId: z.string().min(3).max(150),
        name: z.string().min(2).max(100),
        role: z.enum(["admin", "driver", "student", "guardian", "monitor"]),
      })
      .strict(),
  );
  await c
    .get("db")
    .insert(s.memberships)
    .values({ ...p, id: uuid(), orgId: c.get("actor").orgId });
  await log(c, "membership_created", p.userId);
  return c.json({ ok: true }, 201);
});
app.post("/guardians", async (c) => {
  roles(c, "admin");
  const p = await payload(
      c,
      z
        .object({
          studentId: z.string(),
          userId: z.string().min(3).max(150),
          name: z.string().min(2).max(100),
          verified: z.literal(true),
        })
        .strict(),
    ),
    db = c.get("db"),
    a = c.get("actor");
  const [st] = await db
    .select()
    .from(s.students)
    .where(and(eq(s.students.id, p.studentId), eq(s.students.orgId, a.orgId)));
  if (!st) fail(404, "Aluno não encontrado");
  await db
    .insert(s.guardianLinks)
    .values({
      id: uuid(),
      orgId: a.orgId,
      studentId: p.studentId,
      userId: p.userId,
      name: p.name,
    });
  await log(c, "guardian_link_verified", p.studentId);
  return c.json({ ok: true }, 201);
});
app.post("/settings", async (c) => {
  roles(c, "admin");
  const p = await payload(
    c,
    z
      .object({
        name: z.string().min(2).max(100),
        maxWait: z.number().int().min(0).max(300),
      })
      .strict(),
  );
  await c
    .get("db")
    .update(s.organizations)
    .set(p)
    .where(eq(s.organizations.id, c.get("actor").orgId));
  await log(c, "settings_updated", c.get("actor").orgId);
  return c.json({ ok: true });
});
app.post("/retention", async (c) => {
  roles(c, "admin");
  const db = c.get("db");
  await db.batch([
    db
      .delete(s.demoSessions)
      .where(
        and(
          eq(s.demoSessions.orgId, c.get("actor").orgId),
          lt(s.demoSessions.expires, Date.now()),
        ),
      ),
    db.delete(s.rateLimits).where(lt(s.rateLimits.expires, Date.now())),
  ]);
  await log(c, "retention_executed", c.get("actor").orgId);
  return c.json({ ok: true });
});
app.post("/walking", async (c) => {
  roles(c, "student", "guardian");
  const p = await payload(
      c,
      z
        .object({
          tripId: z.string(),
          studentId: z.string(),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        })
        .strict(),
    ),
    t = await getTrip(c, p.tripId),
    own = await myStudents(c),
    st = own.find((x) => x.id === p.studentId && x.routeId === t.routeId),
    stop = t.snapshot.stops.find((x) => x.id === st?.stopId);
  if (!stop) fail(404, "Parada não encontrada");
  if (!c.env.VALHALLA_URL)
    return c.json({
      available: false,
      reason:
        "Serviço de trajetos a pé ainda não configurado. Sua posição não foi armazenada.",
    });
  let route;
  try {
    route = await calculateRoute(
      c.env.VALHALLA_URL,
      [{ lat: p.lat, lng: p.lng }, stop],
      "pedestrian",
    );
  } catch {
    fail(503, "Caminhada indisponível no momento");
  }
  const [loc] = await c
      .get("db")
      .select()
      .from(s.locations)
      .where(eq(s.locations.tripId, t.id)),
    eta = estimateArrival({
      position: loc?.position || null,
      itinerary: t.snapshot,
      stopId: stop.id,
      status: t.status,
      delayUntil: t.delayUntil,
      waitUntil: t.waitUntil,
      now: Date.now(),
    });
  return c.json({
    available: true,
    seconds: route.seconds,
    meters: route.meters,
    geometry: route.geometry,
    recommendation: departure(eta.minMinutes, route.seconds, 3),
    margin: 3,
  });
});
app.post("/routes/:id/calculate", async (c) => {
  roles(c, "admin");
  const r = await routeRef(c, c.req.param("id"));
  if (!c.env.VALHALLA_URL)
    fail(503, "Provedor de roteamento ainda não configurado");
  let route;
  try {
    route = await calculateRoute(c.env.VALHALLA_URL, r.stops, "bus");
  } catch {
    fail(503, "Não foi possível calcular o trajeto sobre vias");
  }
  const snapshot = {
      name: r.name,
      stops: r.stops,
      geometry: route.geometry,
      routed: true,
    },
    db = c.get("db");
  await db.batch([
    db
      .update(s.routes)
      .set({ geometry: route.geometry, routed: true, version: r.version + 1 })
      .where(eq(s.routes.id, r.id)),
    db
      .insert(s.routeVersions)
      .values({
        id: uuid(),
        orgId: r.orgId,
        routeId: r.id,
        version: r.version + 1,
        snapshot,
        createdAt: Date.now(),
      }),
  ]);
  await log(c, "route_calculated", r.id);
  return c.json({ ok: true, meters: route.meters, seconds: route.seconds });
});
app.get("/reports.csv", async (c) => {
  roles(c, "admin");
  const trips = await allowedTrips(c);
  const escape = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    ["Viagem", "Estado", "Previsto", "Início real", "Fim real"],
    ...trips.map((t) => [
      t.name,
      t.status,
      new Date(t.plannedStart).toISOString(),
      t.startedAt ? new Date(t.startedAt).toISOString() : "",
      t.endedAt ? new Date(t.endedAt).toISOString() : "",
    ]),
  ];
  c.header(
    "Content-Disposition",
    'attachment; filename="trackbus-viagens.csv"',
  );
  return c.body(
    "\uFEFF" + rows.map((r) => r.map(escape).join(";")).join("\r\n"),
    200,
    { "Content-Type": "text/csv; charset=utf-8" },
  );
});
app.onError((err, c) => {
  if (err instanceof HTTPException)
    return c.json(
      { error: err.message, requestId: c.get("requestId") },
      err.status,
    );
  let cause: unknown = err;
  let message = "";
  for (let depth = 0; cause instanceof Error && depth < 5; depth++) {
    message += " " + cause.message;
    cause = cause.cause;
  }
  if (
    message.includes("UNIQUE") ||
    message.includes("trip_conflict") ||
    message.includes("active_conflict")
  )
    return c.json(
      {
        error:
          "Conflito: cadastro duplicado ou veículo/motorista já reservado.",
        requestId: c.get("requestId"),
      },
      409,
    );
  if (err instanceof z.ZodError)
    return c.json({ error: "Dados inválidos" }, 422);
  console.error(
    JSON.stringify({
      service: "trackbus",
      requestId: c.get("requestId"),
      kind: err.name,
    }),
  );
  return c.json(
    {
      error: "Não foi possível concluir a operação. Tente novamente.",
      requestId: c.get("requestId"),
    },
    500,
  );
});
export default app;
