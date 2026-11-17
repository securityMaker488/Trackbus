import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, desc, lt, gt, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import * as s from "../../db/schema";
import * as v from "../../packages/validation";
import {
  canTransition,
  activeRoles,
  estimateArrival,
  validatePosition,
  interpolate,
  project,
  distance,
  departure,
  type Role,
  type Position,
  type Stop,
} from "../../packages/domain";
import { seedDemo } from "./seed";
import { verifyAccessIdentity, type AccessConfig } from "./cloudflare-identity";
import { trackJourney, visibleProgress } from "../../packages/domain/tracking";
import { calculateRoute, searchPlaces } from "./routing";
import { calculateLocalRoute } from "../../packages/geodata";
import { nearbyPois } from "./pois";
import {
  mapsConfig,
  googleRoutesKey,
  type MapsEnv,
} from "../../packages/shared/maps";
import { checkin, nextCycle, waitingCounts } from "./cycles";
import { validPushKeys } from "./push";
import { saveWalkEstimate } from "./smart-alerts";
import { googleRoute } from "./google-routes";
import { poiCategories } from "../../packages/shared/pois";
import { deliver, expireWaits, validEndpoint } from "./notifications";
import { preparePresentation } from "./presentation";
import { digest as sha, opaque, limit, session } from "./access";
import {
  schoolRoutes,
  journeyState,
  saveSelection,
  walkToSelection,
} from "./journey";

type Actor = {
  orgId: string;
  userId: string;
  ownerId: string;
  role: Role;
  name: string;
  demo: boolean;
  visitor?: boolean;
  editor?: boolean;
};
export type Bindings = AccessConfig &
  MapsEnv & {
    DB: D1Database;
    VALHALLA_URL?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
  };
type Env = {
  Bindings: Bindings;
  Variables: {
    db: DrizzleD1Database;
    actor: Actor;
    identity: string;
    identityEmail: string;
    requestId: string;
  };
};
type C = Context<Env>;
type Trip = typeof s.trips.$inferSelect;
const app = new Hono<Env>().basePath("/api");
function fail(
  status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 503,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
const uuid = () => crypto.randomUUID();
function actorMapsConfig(c: C) {
  const config = mapsConfig(c.env);
  // Evaluation credentials must never serve a real institution.
  return config.provider === "google" && config.demo && !c.get("actor").demo
    ? ({ provider: "maplibre", googlePending: true } as const)
    : config;
}
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
async function planBus(c: C, stops: Stop[]) {
  if (actorMapsConfig(c).provider === "google") {
    const key = googleRoutesKey(c.env);
    if (!key) return null;
    await limit(c.get("db"), "google-route:" + c.get("actor").orgId, 20);
    try {
      return await googleRoute(key, stops, "DRIVE");
    } catch {
      return null;
    }
  }
  const local = calculateLocalRoute(stops, "bus");
  if (local) return local;
  if (c.env.VALHALLA_URL) {
    try {
      return await calculateRoute(c.env.VALHALLA_URL, stops, "bus");
    } catch {
      /* Save an explicitly schematic draft if the provider is unavailable. */
    }
  }
  return null;
}
function geometryOrigin(plan: object | null) {
  return !plan
    ? "schematic"
    : "source" in plan && plan.source === "google"
      ? "google"
      : "source" in plan && plan.source === "osm-local"
        ? "osm-local"
        : "institutional";
}
function geometryMetadata(plan: object | null, drawing?: [number, number][]) {
  return {
    geometrySource: !plan && drawing ? "user-drawn" : geometryOrigin(plan),
    geometryExpiresAt:
      geometryOrigin(plan) === "google" ? Date.now() + 86400000 : null,
  };
}
async function planDraft(
  c: C,
  data: {
    stops: Stop[];
    drawing?: [number, number][];
    adjustDrawing?: boolean;
  },
) {
  if (!data.drawing) return planBus(c, data.stops);
  if (!data.adjustDrawing) return null;
  const points = data.drawing
    .filter(
      (_, i) =>
        i === 0 ||
        i === data.drawing!.length - 1 ||
        i % Math.ceil((data.drawing!.length - 1) / 23) === 0,
    )
    .map(([lng, lat], i) => ({
      lng,
      lat,
      id: String(i),
      name: "Via " + i,
      dwellSeconds: 0,
    }));
  return planBus(c, points);
}
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
  await c.get("db").insert(s.audit).values({
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
  await c.get("db").insert(s.tripEvents).values({
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
      .where(
        and(
          eq(s.trips.orgId, a.orgId),
          inArray(
            s.trips.routeId,
            db
              .select({ id: s.routes.id })
              .from(s.routes)
              .where(isNull(s.routes.archivedAt)),
          ),
        ),
      )
      .orderBy(desc(s.trips.plannedStart))
      .limit(500);
  if (a.role === "admin") return all;
  if (a.role === "student") {
    const visible = new Set((await schoolRoutes(db, a.orgId)).map((r) => r.id));
    return all.filter((t) => visible.has(t.routeId));
  }
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
    .where(
      and(
        eq(s.routes.id, id),
        eq(s.routes.orgId, c.get("actor").orgId),
        isNull(s.routes.archivedAt),
      ),
    );
  if (!r) fail(422, "Rota inválida para esta instituição");
  return r;
}
function editRoutePermission(c: C, route: typeof s.routes.$inferSelect) {
  roles(c, "admin", "driver");
  const a = c.get("actor");
  if (
    a.role === "driver" &&
    (route.createdBy !== a.userId ||
      !["draft", "rejected"].includes(route.approval))
  )
    fail(403, "Edite apenas seus rascunhos ou rotas devolvidas pela gestão.");
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
    const nativeRequest =
      !c.req.header("Origin") &&
      (c.req.path === "/api/driver/exchange" ||
        c.req.header("Authorization")?.startsWith("Bearer "));
    if (!nativeRequest && c.req.header("Origin") !== new URL(c.req.url).origin)
      fail(403, "Origem não autorizada");
    if (!c.req.header("Content-Type")?.startsWith("application/json"))
      fail(400, "Content-Type deve ser application/json");
  }
  if (!c.env.DB) fail(503, "Banco não configurado");
  c.set("db", drizzle(c.env.DB));
  await next();
});
app.get("/health", (c) => c.json({ service: "TrackBus", status: "ok" }));
app.get("/auth/config", (c) =>
  c.json({
    loginPath:
      c.env.AUTH_PROVIDER === "cloudflare-access"
        ? "/entrar"
        : "/signin-with-chatgpt?return_to=/",
  }),
);
app.get("/journey/schools", async (c) =>
  c.json(
    await c
      .get("db")
      .select({ id: s.organizations.id, name: s.organizations.name })
      .from(s.organizations)
      .where(
        and(eq(s.organizations.demo, true), eq(s.organizations.roomOpen, true)),
      )
      .limit(100),
  ),
);
app.post("/journey/join", async (c) => {
  const db = c.get("db"),
    p = await payload(
      c,
      z
        .object({
          schoolId: z.string().max(100),
          name: z.string().trim().min(2).max(48),
        })
        .strict(),
    );
  await limit(
    db,
    "join:" + (await sha(c.req.header("CF-Connecting-IP") || "local")),
    20,
  );
  const [org] = await db
    .select()
    .from(s.organizations)
    .where(
      and(
        eq(s.organizations.id, p.schoolId),
        eq(s.organizations.demo, true),
        eq(s.organizations.roomOpen, true),
      ),
    );
  if (!org) fail(404, "Escola de demonstração indisponível");
  const token = opaque(),
    prior = getCookie(c, "tb_visitor");
  if (prior)
    await db
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.id, await sha(prior)),
          eq(s.accessSessions.kind, "visitor"),
        ),
      );
  await db.insert(s.accessSessions).values({
    id: await sha(token),
    orgId: org.id,
    kind: "visitor",
    subject: "visitor:" + uuid(),
    name: p.name,
    expires: Date.now() + 4 * 3600000,
  });
  setCookie(c, "tb_visitor", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 4 * 3600,
  });
  return c.json({ ok: true }, 201);
});
app.post("/journey/leave", async (c) => {
  const token = getCookie(c, "tb_visitor"),
    db = c.get("db");
  if (token) {
    const [visitor] = await db
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.id, await sha(token)),
          eq(s.accessSessions.kind, "visitor"),
        ),
      )
      .returning();
    if (visitor) {
      await db.run(
        sql`DELETE FROM walk_estimates WHERE org_id=${visitor.orgId} AND subject=${visitor.subject}`,
      );
      await db.run(
        sql`DELETE FROM journey_alerts WHERE org_id=${visitor.orgId} AND subject=${visitor.subject}`,
      );
      await db.batch([
        db
          .delete(s.studentCheckins)
          .where(
            and(
              eq(s.studentCheckins.orgId, visitor.orgId),
              eq(s.studentCheckins.subject, visitor.subject),
            ),
          ),
        db
          .delete(s.journeyPreferences)
          .where(
            and(
              eq(s.journeyPreferences.orgId, visitor.orgId),
              eq(s.journeyPreferences.subject, visitor.subject),
            ),
          ),
        db
          .delete(s.pushSubscriptions)
          .where(
            and(
              eq(s.pushSubscriptions.orgId, visitor.orgId),
              eq(s.pushSubscriptions.subject, visitor.subject),
            ),
          ),
        db
          .delete(s.readReceipts)
          .where(
            and(
              eq(s.readReceipts.orgId, visitor.orgId),
              eq(s.readReceipts.userId, visitor.subject),
            ),
          ),
      ]);
    }
  }
  deleteCookie(c, "tb_visitor", { path: "/" });
  return c.json({ ok: true });
});
app.post("/driver/exchange", async (c) => {
  const db = c.get("db"),
    { code } = await payload(
      c,
      z.object({ code: z.string().regex(/^[A-F0-9]{16}$/) }).strict(),
    );
  await limit(
    db,
    "pair:" + (await sha(c.req.header("CF-Connecting-IP") || "local")),
    10,
  );
  const [pair] = await db
    .delete(s.accessSessions)
    .where(
      and(
        eq(s.accessSessions.id, await sha(code)),
        eq(s.accessSessions.kind, "pair"),
        gt(s.accessSessions.expires, Date.now()),
      ),
    )
    .returning();
  if (!pair) fail(401, "Código expirado, já utilizado ou inválido");
  const token = opaque();
  await db.insert(s.accessSessions).values({
    ...pair,
    id: await sha(token),
    kind: "device",
    expires: Date.now() + 8 * 3600000,
  });
  return c.json({ token, expiresIn: 28800 });
});
app.post("/driver/web-exchange", async (c) => {
  const db = c.get("db"),
    { code } = await payload(
      c,
      z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    );
  await limit(
    db,
    "editor-exchange:" +
      (await sha(c.req.header("CF-Connecting-IP") || "local")),
    10,
  );
  const [handoff] = await db
    .delete(s.accessSessions)
    .where(
      and(
        eq(s.accessSessions.id, await sha(code)),
        eq(s.accessSessions.kind, "handoff"),
        gt(s.accessSessions.expires, Date.now()),
      ),
    )
    .returning();
  if (!handoff?.parentId)
    fail(401, "Link expirado. Abra o editor novamente pelo Driver.");
  const [parent] = await db
    .select()
    .from(s.accessSessions)
    .where(
      and(
        eq(s.accessSessions.id, handoff.parentId),
        eq(s.accessSessions.kind, "device"),
        gt(s.accessSessions.expires, Date.now()),
      ),
    );
  if (!parent) fail(401, "Acesso do aparelho encerrado.");
  const token = opaque(),
    expires = Math.min(parent.expires, Date.now() + 3600000);
  await db
    .insert(s.accessSessions)
    .values({ ...handoff, id: await sha(token), kind: "editor", expires });
  deleteCookie(c, "tb_visitor", { path: "/" });
  deleteCookie(c, "tb_demo", { path: "/" });
  setCookie(c, "tb_driver", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: Math.floor((expires - Date.now()) / 1000),
  });
  return c.json({ ok: true });
});
app.use("*", async (c, next) => {
  const db = c.get("db"),
    bearer = c.req.header("Authorization"),
    visitor = getCookie(c, "tb_visitor"),
    editor = getCookie(c, "tb_driver");
  if (bearer || visitor || editor) {
    const kind = bearer ? "device" : visitor ? "visitor" : "editor",
      credential = bearer?.replace(/^Bearer /, "") || visitor || editor || "";
    const a = await session(db, credential, kind);
    if (!a) fail(401, "Sessão expirada. Entre novamente.");
    const path = c.req.path,
      permitted =
        kind === "visitor"
          ? /^\/api\/notices\/[^/]+\/read$/.test(path) ||
            path === "/api/me" ||
            [
              "/api/journey/state",
              "/api/journey/select",
              "/api/journey/walk",
              "/api/maps/config",
              "/api/journey/checkin",
              "/api/journey/walk-estimate",
              "/api/journey/push/status",
            ].includes(path)
          : kind === "editor"
            ? [
                "/api/me",
                "/api/state",
                "/api/geo/pois",
                "/api/maps/config",
                "/api/routes",
                "/api/routes/preview",
                "/api/driver/editor-logout",
              ].includes(path) ||
              /^\/api\/routes\/[^/]+\/(submit|calculate)$/.test(path) ||
              (c.req.method === "PUT" && /^\/api\/routes\/[^/]+$/.test(path))
            : /^\/api\/(driver\/(trips|incidents|revoke|editor-link)|trips\/[^/]+\/(status|location|wait|cycles)|notices|incidents\/[^/]+\/resolve)$/.test(
                path,
              );
    if (!permitted && !(kind === "visitor" && path === "/api/journey/push"))
      fail(403, "Ação fora dos limites desta sessão");
    c.set("identity", a.userId);
    c.set("actor", a);
    if (c.req.method !== "GET") await limit(db, kind + ":" + a.userId, 60);
    await next();
    return;
  }
  let identity: string | undefined;
  if (c.env.AUTH_PROVIDER === "cloudflare-access") {
    try {
      const authenticated = await verifyAccessIdentity(
        c.req.header("Cf-Access-Jwt-Assertion") ||
          getCookie(c, "CF_Authorization") ||
          "",
        c.env,
      );
      identity = authenticated.id;
      c.set("identityEmail", authenticated.email);
    } catch {
      fail(401, "Entre na operação com sua conta autorizada.");
    }
  } else if (
    c.env.AUTH_PROVIDER === undefined ||
    c.env.AUTH_PROVIDER === "sites"
  )
    identity = c.req.header("oai-authenticated-user-id");
  else fail(503, "Provedor de identidade não configurado.");
  if (!identity) fail(401, "Entre com sua conta para continuar");
  c.set("identity", identity);
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
    if (
      session &&
      session.expires > Date.now() &&
      activeRoles.some((role) => role === session.role)
    )
      a = {
        ...a,
        role: session.role,
        userId: session.actorId,
        name: {
          admin: m.name,
          driver:
            (
              await db
                .select({ name: s.drivers.name })
                .from(s.drivers)
                .where(
                  and(
                    eq(s.drivers.orgId, org.id),
                    eq(s.drivers.userId, session.actorId),
                  ),
                )
            )[0]?.name || "Motorista",
          student: "Aluno da demonstração",
          guardian: "Camila Lima",
          monitor: "Monitor demonstrativo",
        }[session.role],
      };
  }
  if (!activeRoles.some((role) => role === a.role))
    fail(403, "Perfil desativado. Use aluno, motorista ou administrador.");
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
app.get("/maps/config", (c) => c.json(actorMapsConfig(c)));
app.get("/me", async (c) => {
  const a = c.get("actor");
  return c.json(
    a ? { actor: a } : { needsSetup: true, identity: c.get("identity") },
  );
});
app.get("/journey/state", async (c) => {
  roles(c, "student");
  const actor = c.get("actor");
  await expireWaits(c.env.DB, actor.orgId);
  return c.json({
    ...(await journeyState(c.get("db"), actor)),
    pushKey:
      c.env.VAPID_PRIVATE_JWK && c.env.VAPID_SUBJECT
        ? c.env.VAPID_PUBLIC_KEY
        : null,
  });
});
app.post("/journey/push", async (c) => {
  roles(c, "student");
  const a = c.get("actor"),
    db = c.get("db"),
    p = await payload(
      c,
      z
        .object({
          endpoint: z.string().max(2048),
          enabled: z.boolean(),
          keys: z
            .object({
              p256dh: z.string().min(86).max(90),
              auth: z.string().min(22).max(24),
            })
            .strict()
            .optional(),
          privatePreview: z.boolean().default(true),
          smart: z.boolean().default(true),
          operational: z.boolean().default(true),
          approaching: z.boolean().default(true),
        })
        .strict(),
    );
  if (!validEndpoint(p.endpoint)) fail(422, "Serviço push não reconhecido");
  const id = await sha(p.endpoint);
  if (!p.enabled) {
    await db
      .delete(s.pushSubscriptions)
      .where(
        and(
          eq(s.pushSubscriptions.id, id),
          eq(s.pushSubscriptions.subject, a.userId),
          eq(s.pushSubscriptions.orgId, a.orgId),
        ),
      );
    return c.json({ ok: true });
  }
  if (
    !c.env.VAPID_PRIVATE_JWK ||
    !c.env.VAPID_SUBJECT ||
    !c.env.VAPID_PUBLIC_KEY
  )
    fail(503, "Web Push não configurado");
  if (!p.keys || !(await validPushKeys(p.keys)))
    fail(
      422,
      "Chaves de notificação inválidas. Reative as notificações neste aparelho.",
    );
  const [existing] = await db
    .select()
    .from(s.pushSubscriptions)
    .where(eq(s.pushSubscriptions.id, id));
  if (existing && (existing.orgId !== a.orgId || existing.subject !== a.userId))
    fail(
      409,
      "Esta inscrição pertence a outra sessão. Desative-a no navegador e ative novamente.",
    );
  const own = await db
    .select({ id: s.pushSubscriptions.id })
    .from(s.pushSubscriptions)
    .where(
      and(
        eq(s.pushSubscriptions.orgId, a.orgId),
        eq(s.pushSubscriptions.subject, a.userId),
        gt(s.pushSubscriptions.expires, Date.now()),
      ),
    );
  if (!existing && own.length >= 5)
    fail(
      409,
      "Limite de cinco aparelhos por sessão. Desative um aparelho antes de continuar.",
    );
  const registered = await db
    .insert(s.pushSubscriptions)
    .values({
      id,
      orgId: a.orgId,
      subject: a.userId,
      endpoint: p.endpoint,
      ...p.keys,
      privatePreview: p.privatePreview,
      smart: p.smart,
      operational: p.operational,
      approaching: p.approaching,
      expires: Date.now() + (a.visitor ? 4 * 3600000 : 30 * 86400000),
    })
    .onConflictDoUpdate({
      target: s.pushSubscriptions.id,
      setWhere: and(
        eq(s.pushSubscriptions.orgId, a.orgId),
        eq(s.pushSubscriptions.subject, a.userId),
      ),
      set: {
        ...p.keys,
        privatePreview: p.privatePreview,
        smart: p.smart,
        operational: p.operational,
        approaching: p.approaching,
        subject: a.userId,
        orgId: a.orgId,
        expires: Date.now() + (a.visitor ? 4 * 3600000 : 30 * 86400000),
      },
    })
    .returning({ id: s.pushSubscriptions.id });
  if (!registered.length)
    fail(
      409,
      "A inscrição foi alterada por outra sessão. Reative as notificações.",
    );
  return c.json({ ok: true });
});
app.post("/journey/push/status", async (c) => {
  roles(c, "student");
  const p = await payload(
      c,
      z.object({ endpoint: z.string().max(2048) }).strict(),
    ),
    a = c.get("actor");
  const [sub] = await c
    .get("db")
    .select({
      expires: s.pushSubscriptions.expires,
      privatePreview: s.pushSubscriptions.privatePreview,
      smart: s.pushSubscriptions.smart,
      operational: s.pushSubscriptions.operational,
      approaching: s.pushSubscriptions.approaching,
    })
    .from(s.pushSubscriptions)
    .where(
      and(
        eq(s.pushSubscriptions.id, await sha(p.endpoint)),
        eq(s.pushSubscriptions.orgId, a.orgId),
        eq(s.pushSubscriptions.subject, a.userId),
        gt(s.pushSubscriptions.expires, Date.now()),
        sql`${s.pushSubscriptions.p256dh} IS NOT NULL`,
      ),
    );
  return c.json(sub ? { active: true, ...sub } : { active: false });
});
app.post("/journey/select", async (c) => {
  roles(c, "student");
  const choice = await payload(
    c,
    z
      .object({
        routeId: z.string(),
        stopId: z.string(),
        favorite: z.boolean(),
        notify: z.boolean(),
      })
      .strict(),
  );
  await saveSelection(c.get("db"), c.get("actor"), choice);
  return c.json({ ok: true });
});
app.post("/journey/checkin", async (c) => {
  roles(c, "student");
  const p = await payload(
    c,
    z
      .object({
        tripId: z.string().min(1).max(100),
        cycle: z.number().int().positive(),
        stopId: z.string().min(1).max(100),
        active: z.boolean(),
      })
      .strict(),
  );
  const t = await getTrip(c, p.tripId);
  return c.json(await checkin(c.get("db"), c.get("actor"), t, p));
});
app.post("/journey/walk", async (c) => {
  roles(c, "student");
  const pos = await payload(
    c,
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .strict(),
  );
  return c.json(
    await walkToSelection(
      c.get("db"),
      c.get("actor"),
      pos,
      c.env.VALHALLA_URL,
      actorMapsConfig(c).provider === "google"
        ? googleRoutesKey(c.env)
        : undefined,
    ),
  );
});
app.post("/journey/walk-estimate", async (c) => {
  roles(c, "student");
  const p = await payload(
      c,
      z.object({ minutes: z.number().int().min(1).max(180) }).strict(),
    ),
    a = c.get("actor"),
    state = await journeyState(c.get("db"), a),
    pref = state.preferences.find((p) => p.selected);
  if (!state.trip?.currentCycle || !pref?.notify)
    fail(409, "Selecione uma viagem ativa e habilite os alertas da sua rota.");
  await saveWalkEstimate(c.get("db"), {
    orgId: a.orgId,
    subject: a.userId,
    tripId: state.trip.id,
    cycle: state.trip.currentCycle,
    routeId: pref.routeId,
    stopId: pref.stopId,
    seconds: p.minutes * 60,
  });
  return c.json({ ok: true, validUntil: Date.now() + 600000 });
});
app.post("/journey/room", async (c) => {
  roles(c, "admin");
  const a = c.get("actor"),
    db = c.get("db");
  if (!a.demo) fail(403, "Entrada por apelido exclusiva da demonstração");
  const p = await payload(
    c,
    z
      .object({
        roomOpen: z.boolean(),
        safetyMargin: z.number().int().min(1).max(15),
      })
      .strict(),
  );
  await db
    .update(s.organizations)
    .set(p)
    .where(eq(s.organizations.id, a.orgId));
  if (!p.roomOpen)
    await db
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.orgId, a.orgId),
          eq(s.accessSessions.kind, "visitor"),
        ),
      );
  await log(c, "journey_room_changed", a.orgId);
  return c.json({ ok: true });
});
app.post("/journey/prepare", async (c) => {
  roles(c, "admin");
  const a = c.get("actor");
  if (!a.demo) fail(403, "Circuito exclusivo da demonstração");
  await preparePresentation(c.get("db"), a.orgId);
  await log(c, "presentation_prepared", a.orgId);
  return c.json({ ok: true });
});
app.post("/routes/:id/visibility", async (c) => {
  roles(c, "admin");
  const r = await routeRef(c, c.req.param("id")),
    p = await payload(c, z.object({ published: z.boolean() }).strict());
  if (p.published && r.approval !== "approved")
    fail(409, "Aprove a rota antes de publicar.");
  await c.get("db").update(s.routes).set(p).where(eq(s.routes.id, r.id));
  await log(c, "route_visibility", r.id);
  return c.json({ ok: true });
});
app.post("/driver/pair", async (c) => {
  roles(c, "admin", "driver");
  const a = c.get("actor"),
    db = c.get("db"),
    p = await payload(c, z.object({ driverId: z.string() }).strict());
  const [driver] = await db
    .select()
    .from(s.drivers)
    .where(
      and(
        eq(s.drivers.id, p.driverId),
        eq(s.drivers.orgId, a.orgId),
        eq(s.drivers.status, "active"),
      ),
    );
  if (!driver?.userId || (a.role === "driver" && driver.userId !== a.userId))
    fail(403, "Motorista sem conta autorizada");
  const code = opaque().slice(0, 16).toUpperCase(),
    expires = Date.now() + 120000;
  await db.batch([
    db
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.orgId, a.orgId),
          eq(s.accessSessions.subject, driver.userId),
          eq(s.accessSessions.kind, "pair"),
        ),
      ),
    db.insert(s.accessSessions).values({
      id: await sha(code),
      kind: "pair",
      orgId: a.orgId,
      subject: driver.userId,
      name: driver.name,
      expires,
    }),
  ]);
  await log(c, "driver_pair_issued", driver.id);
  return c.json({ code, expires });
});
app.get("/driver/trips", async (c) => {
  roles(c, "driver");
  const trips = (await allowedTrips(c)).filter(
    (t) =>
      !["completed", "cancelled"].includes(t.status) &&
      t.trackingMode !== "simulation",
  );
  const fixes = trips.length
    ? await c
        .get("db")
        .select()
        .from(s.locations)
        .where(
          and(
            eq(s.locations.orgId, c.get("actor").orgId),
            inArray(
              s.locations.tripId,
              c
                .get("db")
                .select({ id: s.trips.id })
                .from(s.trips)
                .innerJoin(s.drivers, eq(s.drivers.id, s.trips.driverId))
                .where(
                  and(
                    eq(s.trips.orgId, c.get("actor").orgId),
                    eq(s.drivers.orgId, c.get("actor").orgId),
                    eq(s.drivers.userId, c.get("actor").userId),
                    inArray(s.trips.status, [
                      "scheduled",
                      "in_progress",
                      "paused",
                      "interrupted",
                    ]),
                  ),
                ),
            ),
          ),
        )
    : [];
  const waiting = await waitingCounts(
    c.get("db"),
    c.get("actor").orgId,
    trips.map((t) => t.id),
  );
  return c.json(
    trips.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      stops: t.snapshot.stops,
      trackingMode: t.trackingMode,
      currentCycle: t.currentCycle,
      plannedEnd: t.plannedEnd,
      waiting: waiting.filter((w) => w.tripId === t.id),
      progress: visibleProgress(
        fixes.find((f) => f.tripId === t.id)?.progress,
        t.status,
        Date.now(),
      ),
    })),
  );
});
app.post("/driver/editor-link", async (c) => {
  roles(c, "driver");
  const credential = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!credential) fail(403, "Abra este recurso pelo aplicativo autorizado.");
  const db = c.get("db"),
    parentId = await sha(credential);
  await limit(db, "editor-link:" + parentId, 5);
  const [parent] = await db
    .select()
    .from(s.accessSessions)
    .where(
      and(
        eq(s.accessSessions.id, parentId),
        eq(s.accessSessions.kind, "device"),
        gt(s.accessSessions.expires, Date.now()),
      ),
    );
  if (!parent) fail(401, "Sessão expirada.");
  const code = opaque();
  await db.insert(s.accessSessions).values({
    ...parent,
    id: await sha(code),
    kind: "handoff",
    parentId,
    expires: Math.min(parent.expires, Date.now() + 60000),
  });
  return c.json({ code });
});
app.post("/driver/editor-logout", async (c) => {
  const token = getCookie(c, "tb_driver");
  if (token)
    await c
      .get("db")
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.id, await sha(token)),
          eq(s.accessSessions.kind, "editor"),
        ),
      );
  deleteCookie(c, "tb_driver", { path: "/" });
  return c.json({ ok: true });
});
app.post("/driver/revoke", async (c) => {
  roles(c, "driver");
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (token)
    await c
      .get("db")
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.id, await sha(token)),
          eq(s.accessSessions.kind, "device"),
        ),
      );
  return c.json({ ok: true });
});
app.get("/driver/incidents", async (c) => {
  roles(c, "driver");
  const ids = new Set((await allowedTrips(c)).map((t) => t.id));
  const list = await c
    .get("db")
    .select({
      id: s.incidents.id,
      tripId: s.incidents.tripId,
      description: s.incidents.description,
    })
    .from(s.incidents)
    .where(
      and(
        eq(s.incidents.orgId, c.get("actor").orgId),
        eq(s.incidents.status, "open"),
      ),
    )
    .limit(200);
  return c.json(list.filter((i) => ids.has(i.tripId)));
});
app.post("/bootstrap", async (c) => {
  if (c.get("actor")) fail(409, "Instituição já configurada");
  if (
    c.env.AUTH_PROVIDER === "cloudflare-access" &&
    (!c.env.INITIAL_ADMIN_EMAIL ||
      c.get("identityEmail") !== c.env.INITIAL_ADMIN_EMAIL.toLowerCase())
  )
    fail(403, "Configuração inicial exclusiva do administrador autorizado.");
  const name =
    c.env.AUTH_PROVIDER === "cloudflare-access"
      ? "Administrador"
      : c.req.header("oai-authenticated-user-full-name") || "Administrador";
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
        role: z.enum(activeRoles),
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
  await db.insert(s.demoSessions).values({
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
  await expireWaits(c.env.DB, c.get("actor").orgId);
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
    db
      .select()
      .from(s.routes)
      .where(and(eq(s.routes.orgId, orgId), isNull(s.routes.archivedAt)))
      .limit(500),
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
      ? ss.filter((st) => rs.some((r) => r.id === st.routeId))
      : a.role === "monitor"
        ? ss.filter((st) => routeIds.has(st.routeId))
        : own,
    studentIds = new Set(visibleStudents.map((st) => st.id));
  const visibleLocations = ls
    .filter((l) => tripIds.has(l.tripId))
    .map((l) => ({
      ...l,
      progress: visibleProgress(
        l.progress,
        ts.find((t) => t.id === l.tripId)?.status,
        Date.now(),
      ),
    }));
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
    waiting: await waitingCounts(
      db,
      orgId,
      ts.map((t) => t.id),
    ),
    cycles: tripIds.size
      ? await db
          .select()
          .from(s.tripCycles)
          .where(
            and(
              eq(s.tripCycles.orgId, orgId),
              inArray(s.tripCycles.tripId, [...tripIds]),
            ),
          )
          .orderBy(desc(s.tripCycles.startedAt))
          .limit(500)
      : [],
    organization: {
      id: org[0].id,
      name: org[0].name,
      demo: org[0].demo,
      maxWait: org[0].maxWait,
      roomOpen: org[0].roomOpen,
      safetyMargin: org[0].safetyMargin,
    },
    vehicles: admin
      ? vs
      : vs.filter((v) => ts.some((t) => t.vehicleId === v.id)),
    drivers: admin
      ? ds
      : ds
          .filter((d) => ts.some((t) => t.driverId === d.id))
          .map((d) => ({ ...d, contact: "", userId: null })),
    routes: admin
      ? rs
      : a.role === "student"
        ? rs.filter((r) => r.published && r.active && r.approval === "approved")
        : rs.filter(
            (r) =>
              routeIds.has(r.id) ||
              r.createdBy === a.userId ||
              r.approval === "approved",
          ),
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
    routingConfigured: true,
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
    .values({
      ...data,
      userId: data.userId || "driver:" + uuid(),
      id,
      orgId: c.get("actor").orgId,
    });
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
  await c
    .get("db")
    .update(s.drivers)
    .set({ ...data, userId: data.userId || d.userId || "driver:" + uuid() })
    .where(eq(s.drivers.id, d.id));
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
app.get("/geo/pois", async (c) => {
  roles(c, "admin", "driver");
  const parsed = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().int().min(100).max(3000).default(1500),
      category: z.string().default("all"),
    })
    .strict()
    .safeParse(c.req.query());
  if (
    !parsed.success ||
    (parsed.data.category !== "all" &&
      !Object.hasOwn(poiCategories, parsed.data.category))
  )
    fail(422, "Região ou categoria inválida");
  await limit(c.get("db"), "poi:" + c.get("actor").userId, 30);
  return c.json(
    nearbyPois(parsed.data, parsed.data.radius, parsed.data.category),
  );
});
app.get("/geo/search", async (c) => {
  roles(c, "admin", "driver");
  const query = c.req.query("q");
  if (!query || query.trim().length < 2)
    return c.json([]);
  await limit(c.get("db"), "geo-search:" + c.get("actor").userId, 30);
  const results = await searchPlaces(query, 10, fetch, c.get("RATE_LIMIT_KV"));
  return c.json(
    results.map((r) => ({
      id: String(r.id),
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      type: r.type,
    })),
  );
});
app.post("/routes/preview", async (c) => {
  roles(c, "admin", "driver");
  const data = await payload(c, v.routeSchema);
  const plan = await planDraft(c, { ...data, adjustDrawing: true });
  if (plan) return c.json({ available: true, ...plan });
  return c.json({
    available: false,
    message:
      "Trajeto esquemático. Não foi encontrada uma via conectada na cobertura disponível. Você pode salvar e revisar depois.",
  });
});
app.post("/routes", async (c) => {
  roles(c, "admin", "driver");
  const data = await payload(c, v.routeSchema),
    id = uuid(),
    orgId = c.get("actor").orgId,
    planned = await planDraft(c, data),
    geometry =
      planned?.geometry ??
      data.drawing ??
      data.stops.map((st) => [st.lng, st.lat] as [number, number]),
    snapshot = {
      name: data.name,
      stops: data.stops,
      geometry,
      routed: !!planned,
      ...geometryMetadata(planned, data.drawing),
    };
  await c.get("db").batch([
    c
      .get("db")
      .insert(s.routes)
      .values({
        ...data,
        id,
        orgId,
        geometry,
        routed: snapshot.routed,
        distanceMeters:
          geometryOrigin(planned) === "google"
            ? null
            : (planned?.meters ?? null),
        ...geometryMetadata(planned, data.drawing),
        createdBy: c.get("actor").userId,
        approval: c.get("actor").role === "admin" ? "approved" : "draft",
        published: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    c.get("db").insert(s.routeVersions).values({
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
app.post("/routes/:id/archive", async (c) => {
  roles(c, "admin");
  const r = await routeRef(c, c.req.param("id")),
    db = c.get("db"),
    now = Date.now();
  const running = await db
    .select({ id: s.trips.id })
    .from(s.trips)
    .where(
      and(
        eq(s.trips.routeId, r.id),
        inArray(s.trips.status, ["in_progress", "paused", "interrupted"]),
      ),
    );
  if (running.length && !c.get("actor").demo)
    fail(409, "Encerre as viagens em operação antes de remover a rota.");
  await db.batch([
    db
      .update(s.routes)
      .set({ archivedAt: now, active: false, published: false })
      .where(and(eq(s.routes.id, r.id), eq(s.routes.orgId, r.orgId))),
    db
      .update(s.trips)
      .set({
        status: "cancelled",
        endedAt: now,
        waitUntil: null,
        waitStopId: null,
        delayUntil: null,
        revision: sql`${s.trips.revision}+1`,
      })
      .where(
        and(
          eq(s.trips.routeId, r.id),
          inArray(s.trips.status, [
            "scheduled",
            "in_progress",
            "paused",
            "interrupted",
          ]),
        ),
      ),
    db
      .delete(s.journeyPreferences)
      .where(
        and(
          eq(s.journeyPreferences.orgId, r.orgId),
          eq(s.journeyPreferences.routeId, r.id),
        ),
      ),
    db.insert(s.audit).values({
      id: uuid(),
      orgId: r.orgId,
      actorId: c.get("actor").userId,
      action: "route_archived",
      entityId: r.id,
      createdAt: now,
    }),
  ]);
  return c.json({ ok: true });
});
app.put("/routes/:id", async (c) => {
  roles(c, "admin", "driver");
  const data = await payload(c, v.routeSchema),
    r = await routeRef(c, c.req.param("id"));
  editRoutePermission(c, r);
  if (data.expectedVersion !== undefined && data.expectedVersion !== r.version)
    fail(409, "Rota atualizada em outro dispositivo. Reabra o editor.");
  const unchanged =
      !data.drawing &&
      (!r.geometryExpiresAt || r.geometryExpiresAt > Date.now()) &&
      JSON.stringify(data.stops.map((st) => [st.id, st.lat, st.lng])) ===
        JSON.stringify(r.stops.map((st) => [st.id, st.lat, st.lng])),
    planned = unchanged && r.routed ? null : await planDraft(c, data),
    geometry =
      unchanged && r.routed
        ? r.geometry
        : (planned?.geometry ??
          data.drawing ??
          data.stops.map((st) => [st.lng, st.lat] as [number, number])),
    routed = (unchanged && r.routed) || !!planned;
  const metadata =
    unchanged && r.routed
      ? {
          geometrySource: r.geometrySource,
          geometryExpiresAt: r.geometryExpiresAt,
        }
      : geometryMetadata(planned, data.drawing);
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
      .set({
        ...data,
        geometry,
        routed,
        distanceMeters:
          unchanged && r.routed
            ? r.distanceMeters
            : geometryOrigin(planned) === "google"
              ? null
              : (planned?.meters ?? null),
        ...metadata,
        version: r.version + 1,
        updatedAt: Date.now(),
        ...(c.get("actor").role === "driver"
          ? { approval: "draft" as const, published: false }
          : {}),
      })
      .where(
        and(
          eq(s.routes.id, r.id),
          eq(s.routes.version, r.version),
          eq(s.routes.approval, r.approval),
        ),
      ),
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
          routed,
          ...metadata,
        },
        createdAt: Date.now(),
      }),
  ]);
  await log(c, "route_version_created", r.id);
  return c.json({ ok: true });
});
app.post("/routes/:id/submit", async (c) => {
  roles(c, "driver");
  const r = await routeRef(c, c.req.param("id"));
  editRoutePermission(c, r);
  const p = await payload(
    c,
    z.object({ version: z.number().int().positive() }).strict(),
  );
  const changed = await c
    .get("db")
    .update(s.routes)
    .set({
      approval: "pending",
      published: false,
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      reviewNote: "",
    })
    .where(
      and(
        eq(s.routes.id, r.id),
        eq(s.routes.version, p.version),
        inArray(s.routes.approval, ["draft", "rejected"]),
      ),
    )
    .returning();
  if (!changed.length) fail(409, "A rota mudou. Atualize antes de enviar.");
  await log(c, "route_submitted", r.id);
  return c.json({ ok: true });
});
app.post("/routes/:id/review", async (c) => {
  roles(c, "admin");
  const r = await routeRef(c, c.req.param("id"));
  const p = await payload(
    c,
    z
      .object({
        version: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).default(""),
      })
      .strict(),
  );
  if (p.decision === "rejected" && p.note.length < 5)
    fail(422, "Explique ao motorista o ajuste necessário.");
  const changed = await c
    .get("db")
    .update(s.routes)
    .set({
      approval: p.decision,
      reviewNote: p.note,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
      published: false,
    })
    .where(
      and(
        eq(s.routes.id, r.id),
        eq(s.routes.version, p.version),
        eq(s.routes.approval, "pending"),
      ),
    )
    .returning();
  if (!changed.length)
    fail(409, "Solicitação já analisada ou rota atualizada.");
  await log(c, "route_" + p.decision, r.id);
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
  if (!r.active || r.approval !== "approved" || vehicle.status !== "available")
    fail(409, "Rota ou veículo indisponível");
  if (r.geometryExpiresAt && r.geometryExpiresAt <= Date.now())
    fail(409, "Recalcule o trajeto Google antes de programar a viagem.");
  if (data.trackingMode === "simulation" && !a.demo)
    fail(403, "Simulador exclusivo da demonstração");
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
  await db.insert(s.trips).values({
    ...data,
    id,
    orgId: a.orgId,
    snapshot: {
      name: r.name,
      stops: r.stops,
      geometry: r.geometry,
      routed: r.routed,
      geometrySource: r.geometrySource,
      geometryExpiresAt: r.geometryExpiresAt,
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
    if (
      t.snapshot.geometryExpiresAt &&
      t.snapshot.geometryExpiresAt <= Date.now()
    )
      fail(
        409,
        "Trajeto Google expirado. Recalcule a rota e programe uma nova viagem.",
      );
    if (t.status === "scheduled" && Date.now() >= t.plannedEnd)
      fail(409, "O horário desta viagem terminou. Programe um novo serviço.");
    if (
      (
        await c
          .get("db")
          .select({ id: s.incidents.id })
          .from(s.incidents)
          .where(
            and(eq(s.incidents.tripId, t.id), eq(s.incidents.status, "open")),
          )
          .limit(1)
      ).length
    )
      fail(409, "Resolva a ocorrência antes de retomar");
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
  await publishNotice(
    c,
    t,
    status,
    `Viagem ${t.name}: ${{ scheduled: "programada", in_progress: "em andamento", paused: "pausada", interrupted: "interrompida", completed: "encerrada", cancelled: "cancelada" }[status]}.`,
  );
  return c.json({ ok: true });
});
app.post("/trips/:id/cycles", async (c) => {
  const t = await getTrip(c, c.req.param("id"), true);
  const p = await payload(
    c,
    z
      .object({
        expectedCycle: z.number().int().positive(),
        safe: z.literal(true),
      })
      .strict(),
  );
  const updated = await nextCycle(c.get("db"), t, p.expectedCycle);
  await event(
    c,
    t.id,
    "cycle_started",
    `Volta ${updated.currentCycle} iniciada por confirmação do operador`,
    t.trackingMode === "simulation",
  );
  await log(c, "trip_cycle_started", t.id);
  await publishNotice(
    c,
    updated,
    "cycle_started",
    `Nova volta iniciada: ${updated.currentCycle}. Confirme sua parada e atualize a caminhada.`,
  );
  return c.json({ ok: true, currentCycle: updated.currentCycle });
});
async function storePosition(c: C, t: Trip, p: Position, validate = true) {
  const db = c.get("db"),
    [old] = await db
      .select()
      .from(s.locations)
      .where(eq(s.locations.tripId, t.id));
  if (validate) {
    if (
      t.trackingMode === "simulation" ||
      old?.position.source === "simulation"
    )
      fail(409, "Esta viagem usa posição simulada");
    const error = validatePosition(p, old?.position || null, Date.now());
    if (error) fail(422, error);
    if (p.speed === null && old?.position.source === "gps") {
      const elapsed = (p.timestamp - old.position.timestamp) / 1000;
      const meters = distance(p, old.position);
      if (
        elapsed >= 4 &&
        elapsed <= 45 &&
        p.accuracy <= 30 &&
        old.position.accuracy <= 30 &&
        meters > p.accuracy + old.position.accuracy
      )
        p = { ...p, speed: Math.min(45, meters / elapsed) };
    }
  }
  const progress = trackJourney(
    t.snapshot,
    p,
    old?.position ?? null,
    old?.progress ?? null,
    t.status,
  );
  const changed = await db
    .insert(s.locations)
    .values({
      id: uuid(),
      orgId: t.orgId,
      tripId: t.id,
      position: p,
      progress,
      cycle: t.currentCycle,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: s.locations.tripId,
      set: {
        position: p,
        progress,
        cycle: t.currentCycle,
        updatedAt: Date.now(),
      },
      setWhere: old
        ? sql`json_extract(${s.locations.position}, '$.timestamp') = ${old.position.timestamp} AND ${old.position.timestamp} < ${p.timestamp}`
        : sql`0`,
    })
    .returning({ id: s.locations.id });
  if (!changed.length) fail(422, "Outra posição mais recente já foi recebida");
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
  if (t.trackingMode === "gps") fail(409, "Viagem reservada para GPS real");
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
      (loc.position.source === "gps" && (loc.position.speed ?? 0) > 1.5) ||
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
    if (!t.waitUntil) fail(409, "Não há espera em andamento");
    await revise(c, t, { waitUntil: null, waitStopId: null });
    await event(c, t.id, "wait_ended", "Espera encerrada", c.get("actor").demo);
  }
  await publishNotice(
    c,
    t,
    p.seconds ? "waiting" : "wait_ended",
    p.seconds
      ? `Ônibus na parada. Espera autorizada até ${new Date(now + p.seconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" })}.`
      : "Espera encerrada na parada.",
  );
  return c.json({ ok: true });
});
async function publishNotice(c: C, t: Trip, category: string, message: string) {
  const id = uuid();
  await c
    .get("db")
    .insert(s.notices)
    .values({
      id,
      orgId: t.orgId,
      tripId: t.id,
      category,
      message,
      actorId: c.get("actor").userId,
      simulated: t.trackingMode === "simulation",
      createdAt: Date.now(),
    });
  await deliver(c.get("db"), c.env, t, id);
}
app.post("/notices", async (c) => {
  roles(c, "admin", "driver");
  const p = await payload(c, v.noticeSchema),
    t = await getTrip(c, p.tripId, true),
    a = c.get("actor"),
    db = c.get("db");
  if (["completed", "cancelled"].includes(t.status))
    fail(409, "Viagem encerrada");
  if (p.simulated && !a.demo) fail(422, "Evento simulado fora da demonstração");
  if (a.role === "driver" && !p.safeStop)
    fail(422, "Confirme que o veículo está parado em segurança");
  if (a.role === "driver") {
    const [loc] = await db
      .select()
      .from(s.locations)
      .where(eq(s.locations.tripId, t.id));
    if (
      loc &&
      loc.position.source === "gps" &&
      Date.now() - loc.position.timestamp < 30000 &&
      (loc.position.speed || 0) > 1.5
    )
      fail(409, "O GPS ainda indica movimento. Aguarde a parada.");
  }
  if (
    p.category === "resumed" &&
    (
      await db
        .select({ id: s.incidents.id })
        .from(s.incidents)
        .where(
          and(eq(s.incidents.tripId, t.id), eq(s.incidents.status, "open")),
        )
        .limit(1)
    ).length
  )
    fail(409, "Encerre a ocorrência para comunicar a retomada");
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
  await db.insert(s.notices).values({
    id,
    orgId: a.orgId,
    tripId: t.id,
    category: p.category,
    message: p.message,
    actorId: a.userId,
    simulated: p.simulated || t.trackingMode === "simulation",
    createdAt: now,
  });
  if (interruption)
    await db.insert(s.incidents).values({
      id: uuid(),
      orgId: a.orgId,
      tripId: t.id,
      category: p.category,
      description: p.message,
      status: "open",
      actorId: a.userId,
      createdAt: now,
      simulated: p.simulated || t.trackingMode === "simulation",
    });
  await event(
    c,
    t.id,
    p.category,
    p.message,
    p.simulated || t.trackingMode === "simulation",
  );
  await log(c, "notice_created", id);
  await deliver(db, c.env, t, id);
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
  const resolutionNoticeId = uuid();
  await db.insert(s.notices).values({
    id: resolutionNoticeId,
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
  await deliver(db, c.env, t, resolutionNoticeId);
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
  await db.insert(s.boarding).values({
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
        role: z.enum(activeRoles),
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
app.post("/guardians", (c) => {
  roles(c, "admin");
  fail(410, "Perfil de responsável desativado nesta versão.");
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
  const db = c.get("db"),
    orgId = c.get("actor").orgId,
    now = Date.now();
  await db.batch([
    db
      .delete(s.demoSessions)
      .where(
        and(eq(s.demoSessions.orgId, orgId), lt(s.demoSessions.expires, now)),
      ),
    db
      .delete(s.accessSessions)
      .where(
        and(
          eq(s.accessSessions.orgId, orgId),
          lt(s.accessSessions.expires, now),
        ),
      ),
    db
      .delete(s.pushSubscriptions)
      .where(
        and(
          eq(s.pushSubscriptions.orgId, orgId),
          lt(s.pushSubscriptions.expires, now),
        ),
      ),
    db.delete(s.rateLimits).where(lt(s.rateLimits.expires, now)),
  ]);
  await log(c, "retention_executed", orgId);
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
  const local = calculateLocalRoute(
    [{ lat: p.lat, lng: p.lng }, stop],
    "pedestrian",
  );
  if (!local && !c.env.VALHALLA_URL)
    return c.json({
      available: false,
      reason: "Fora da cobertura caminhável. Sua posição não foi armazenada.",
    });
  let route;
  try {
    route =
      local ??
      (await calculateRoute(
        c.env.VALHALLA_URL!,
        [{ lat: p.lat, lng: p.lng }, stop],
        "pedestrian",
      ));
  } catch {
    fail(503, "Caminhada indisponível no momento");
  }
  const db = c.get("db"),
    [[loc], [org]] = await Promise.all([
      db.select().from(s.locations).where(eq(s.locations.tripId, t.id)),
      db.select().from(s.organizations).where(eq(s.organizations.id, t.orgId)),
    ]),
    margin = org?.safetyMargin ?? 3,
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
    source: "source" in route ? route.source : "institutional",
    recommendation: departure(eta.minMinutes, route.seconds, margin),
    margin,
  });
});
app.post("/routes/:id/calculate", async (c) => {
  roles(c, "admin", "driver");
  const r = await routeRef(c, c.req.param("id"));
  editRoutePermission(c, r);
  const route = await planDraft(c, {
    stops: r.stops,
    drawing: r.geometrySource === "user-drawn" ? r.geometry : undefined,
    adjustDrawing: true,
  });
  if (!route)
    fail(
      422,
      "Roteamento indisponível, limite atingido ou paradas sem via conectada. Confira a configuração e tente novamente.",
    );
  const snapshot = {
      name: r.name,
      stops: r.stops,
      geometry: route.geometry,
      routed: true,
      ...geometryMetadata(route),
    },
    db = c.get("db");
  await db.batch([
    db
      .update(s.routes)
      .set({
        geometry: route.geometry,
        routed: true,
        distanceMeters:
          geometryOrigin(route) === "google" ? null : route.meters,
        ...geometryMetadata(route),
        version: r.version + 1,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(s.routes.id, r.id),
          eq(s.routes.version, r.version),
          eq(s.routes.approval, r.approval),
        ),
      ),
    db.insert(s.routeVersions).values({
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
    message.includes("active_conflict") ||
    message.includes("route_version_conflict") ||
    message.includes("route_not_approved") ||
    message.includes("checkin_cycle_conflict")
  )
    return c.json(
      {
        error:
          "Conflito: cadastro duplicado ou veículo/motorista já reservado.",
        requestId: c.get("requestId"),
      },
      409,
    );
  if (message.includes("telemetry_scope"))
    return c.json(
      { error: "Fonte de posição ou estado da viagem incompatível." },
      409,
    );
  if (message.includes("location_cycle_conflict"))
    return c.json(
      {
        error:
          "Posição anterior à volta atual. Aguarde a próxima atualização GPS.",
      },
      422,
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
