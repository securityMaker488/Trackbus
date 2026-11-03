import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  Itinerary,
  Position,
  Role,
  Stop,
  TripStatus,
} from "../packages/domain";
const pk = () => text("id").primaryKey();
export const organizations = sqliteTable("organizations", {
  id: pk(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().unique(),
  demo: integer("demo", { mode: "boolean" }).notNull().default(true),
  maxWait: integer("max_wait").notNull().default(300),
  createdAt: integer("created_at").notNull(),
});
const org = () =>
  text("org_id")
    .notNull()
    .references(() => organizations.id);
export const memberships = sqliteTable(
  "memberships",
  {
    id: pk(),
    orgId: org(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<Role>().notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    uniqueIndex("membership_user").on(t.userId),
    index("membership_org").on(t.orgId),
  ],
);
export const demoSessions = sqliteTable(
  "demo_sessions",
  {
    id: pk(),
    orgId: org(),
    ownerId: text("owner_id").notNull(),
    role: text("role").$type<Role>().notNull(),
    actorId: text("actor_id").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("demo_expiry").on(t.expires)],
);
export const vehicles = sqliteTable(
  "vehicles",
  {
    id: pk(),
    orgId: org(),
    name: text("name").notNull(),
    plate: text("plate").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    capacity: integer("capacity").notNull(),
    status: text("status").notNull(),
  },
  (t) => [uniqueIndex("vehicle_plate").on(t.orgId, t.plate)],
);
export const drivers = sqliteTable(
  "drivers",
  {
    id: pk(),
    orgId: org(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    userId: text("user_id"),
    status: text("status").notNull(),
  },
  (t) => [index("driver_org").on(t.orgId)],
);
export const routes = sqliteTable(
  "routes",
  {
    id: pk(),
    orgId: org(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    shift: text("shift").notNull(),
    stops: text("stops", { mode: "json" }).$type<Stop[]>().notNull(),
    geometry: text("geometry", { mode: "json" })
      .$type<[number, number][]>()
      .notNull(),
    routed: integer("routed", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("route_org").on(t.orgId)],
);
export const routeVersions = sqliteTable(
  "route_versions",
  {
    id: pk(),
    orgId: org(),
    routeId: text("route_id")
      .notNull()
      .references(() => routes.id),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<Itinerary>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("route_version").on(t.routeId, t.version)],
);
export const students = sqliteTable(
  "students",
  {
    id: pk(),
    orgId: org(),
    name: text("name").notNull(),
    enrollment: text("enrollment").notNull(),
    className: text("class_name").notNull(),
    shift: text("shift").notNull(),
    routeId: text("route_id")
      .notNull()
      .references(() => routes.id),
    stopId: text("stop_id").notNull(),
    userId: text("user_id"),
    status: text("status").notNull(),
  },
  (t) => [
    uniqueIndex("student_enrollment").on(t.orgId, t.enrollment),
    index("student_user").on(t.orgId, t.userId),
  ],
);
export const guardianLinks = sqliteTable(
  "guardian_links",
  {
    id: pk(),
    orgId: org(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("guardian_student").on(t.studentId, t.userId),
    index("guardian_user").on(t.orgId, t.userId),
  ],
);
export const trips = sqliteTable(
  "trips",
  {
    id: pk(),
    orgId: org(),
    name: text("name").notNull(),
    routeId: text("route_id")
      .notNull()
      .references(() => routes.id),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id),
    monitorId: text("monitor_id"),
    plannedStart: integer("planned_start").notNull(),
    plannedEnd: integer("planned_end").notNull(),
    startedAt: integer("started_at"),
    endedAt: integer("ended_at"),
    status: text("status").$type<TripStatus>().notNull().default("scheduled"),
    snapshot: text("snapshot", { mode: "json" }).$type<Itinerary>().notNull(),
    delayUntil: integer("delay_until"),
    waitUntil: integer("wait_until"),
    waitStopId: text("wait_stop_id"),
    simProgress: real("sim_progress").notNull().default(0),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [index("trip_org_time").on(t.orgId, t.plannedStart)],
);
export const locations = sqliteTable("locations", {
  id: pk(),
  orgId: org(),
  tripId: text("trip_id")
    .notNull()
    .unique()
    .references(() => trips.id),
  position: text("position", { mode: "json" }).$type<Position>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const tripEvents = sqliteTable(
  "trip_events",
  {
    id: pk(),
    orgId: org(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    type: text("type").notNull(),
    message: text("message").notNull(),
    actorId: text("actor_id").notNull(),
    simulated: integer("simulated", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("events_org_time").on(t.orgId, t.createdAt)],
);
export const notices = sqliteTable(
  "notices",
  {
    id: pk(),
    orgId: org(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    category: text("category").notNull(),
    message: text("message").notNull(),
    actorId: text("actor_id").notNull(),
    simulated: integer("simulated", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notice_org_time").on(t.orgId, t.createdAt)],
);
export const readReceipts = sqliteTable(
  "read_receipts",
  {
    id: pk(),
    orgId: org(),
    noticeId: text("notice_id")
      .notNull()
      .references(() => notices.id),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("notice_read").on(t.noticeId, t.userId)],
);
export const incidents = sqliteTable(
  "incidents",
  {
    id: pk(),
    orgId: org(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    category: text("category").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    resolution: text("resolution"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
    actorId: text("actor_id").notNull(),
    simulated: integer("simulated", { mode: "boolean" }).notNull(),
  },
  (t) => [index("incident_org").on(t.orgId)],
);
export const boarding = sqliteTable(
  "boarding",
  {
    id: pk(),
    orgId: org(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    stopId: text("stop_id").notNull(),
    kind: text("kind").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("boarding_once").on(t.tripId, t.studentId, t.kind)],
);
export const absences = sqliteTable(
  "absences",
  {
    id: pk(),
    orgId: org(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    date: text("date").notNull(),
    shift: text("shift").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    actorId: text("actor_id").notNull(),
  },
  (t) => [uniqueIndex("absence_date").on(t.studentId, t.date, t.shift)],
);
export const maintenance = sqliteTable(
  "maintenance",
  {
    id: pk(),
    orgId: org(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    description: text("description").notNull(),
    kind: text("kind").notNull(),
    date: text("date").notNull(),
    status: text("status").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
  },
  (t) => [index("maintenance_org").on(t.orgId)],
);
export const expenses = sqliteTable(
  "expenses",
  {
    id: pk(),
    orgId: org(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    routeId: text("route_id").references(() => routes.id),
    category: text("category").notNull(),
    description: text("description").notNull(),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [index("expense_org_date").on(t.orgId, t.date)],
);
export const calendar = sqliteTable(
  "calendar",
  {
    id: pk(),
    orgId: org(),
    date: text("date").notNull(),
    title: text("title").notNull(),
    suspended: integer("suspended", { mode: "boolean" }).notNull(),
  },
  (t) => [uniqueIndex("calendar_date").on(t.orgId, t.date)],
);
export const audit = sqliteTable(
  "audit_logs",
  {
    id: pk(),
    orgId: org(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_org_time").on(t.orgId, t.createdAt)],
);
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: pk(),
    count: integer("count").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("rate_expiry").on(t.expires)],
);
