import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import api from "../../apps/api";
import type { State } from "../../packages/shared/types";
let mf: Miniflare, DB: D1Database, a: State, b: State;
const origin = "https://trackbus.test";
async function req(
  path: string,
  body?: unknown,
  user = "owner-a",
  cookie = "",
  originHeader = origin,
) {
  return api.fetch(
    new Request(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(user ? { "oai-authenticated-user-id": user } : {}),
        ...(body === undefined
          ? {}
          : { Origin: originHeader, "Content-Type": "application/json" }),
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { DB },
  );
}
async function state(user = "owner-a", cookie = "") {
  const r = await req("/state", undefined, user, cookie);
  expect(r.status).toBe(200);
  return r.json() as Promise<State>;
}
async function persona(role: string) {
  const r = await req("/demo/profile", { role });
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")?.split(";")[0] || "";
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-05-15",
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync("drizzle/" + f, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await DB.prepare(statement).run();
  }
  expect((await req("/bootstrap", {})).status).toBe(201);
  expect((await req("/bootstrap", {}, "owner-b")).status).toBe(201);
  a = await state();
  b = await state("owner-b");
});
afterAll(async () => {
  await mf?.dispose();
});
describe("limites de confiança / autorização", () => {
  it("nega anônimo e conta sem membership", async () => {
    expect((await req("/state", undefined, "")).status).toBe(401);
    expect((await req("/state", undefined, "outsider")).status).toBe(403);
  });
  it("nega CSRF de outra origem", async () =>
    expect(
      (
        await req(
          "/settings",
          { name: "Hack", maxWait: 0 },
          "owner-a",
          "",
          "https://evil.test",
        )
      ).status,
    ).toBe(403));
  it("isola instituições e impede referências cruzadas", async () => {
    expect(a.organization.id).not.toBe(b.organization.id);
    expect(a.trips.every((t) => t.orgId === a.organization.id)).toBe(true);
    expect(
      (await req(`/trips/${b.trips[0].id}/status`, { status: "in_progress" }))
        .status,
    ).toBe(404);
    const r = await req("/students", {
      name: "Teste",
      enrollment: "X-100",
      className: "6A",
      shift: "Manhã",
      routeId: b.routes[0].id,
      stopId: b.routes[0].stops[0].id,
      status: "active",
    });
    expect(r.status).toBe(422);
  });
  it("aluno vê rotas publicadas da escola sem vínculo administrativo e não pode editar", async () => {
    const cookie = await persona("student"),
      data = await state("owner-a", cookie);
    expect(data.students).toHaveLength(1);
    expect(data.routes).toHaveLength(3);
    expect(data.trips.some(t=>t.routeId!==data.students[0].routeId)).toBe(true);
    expect(data.audit).toHaveLength(0);
    expect(data.expenses).toHaveLength(0);
    expect(
      (await req("/vehicles", { name: "Bus" }, "owner-a", cookie)).status,
    ).toBe(403);
  });
  it("responsável recebe somente aluno vinculado", async () => {
    const cookie = await persona("guardian"),
      data = await state("owner-a", cookie);
    expect(data.students).toHaveLength(1);
    expect(data.students[0].name).toBe("Ana Lima");
    expect(
      (
        await req(
          "/absences",
          { studentId: a.students[1].id, date: "2027-01-05", shift: "Manhã" },
          "owner-a",
          cookie,
        )
      ).status,
    ).toBe(404);
  });
  it("sessão demonstrativa não funciona com outro usuário", async () => {
    const cookie = await persona("student"),
      data = await state("owner-b", cookie);
    expect(data.actor.role).toBe("admin");
    expect(data.actor.orgId).toBe(b.organization.id);
  });
  it("motorista não transmite em viagem alheia", async () => {
    const cookie = await persona("driver"),
      other = a.trips.find(
        (t) =>
          t.driverId !==
          a.drivers.find((d) => d.name === "Carlos Oliveira")!.id,
      )!;
    expect(
      (
        await req(
          `/trips/${other.id}/location`,
          { lat: 0, lng: 0 },
          "owner-a",
          cookie,
        )
      ).status,
    ).toBe(404);
  });
  it("headers proíbem cache da API", async () => {
    const r = await req("/state");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
describe("fluxo vertical persistente", () => {
  it("impede sobreposição de veículo ou motorista", async () => {
    const t = a.trips[0];
    const r = await req("/trips", {
      name: "Conflito",
      routeId: t.routeId,
      vehicleId: t.vehicleId,
      driverId: t.driverId,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
    });
    expect(r.status).toBe(409);
  });
  it("cria veículo, rota e viagem, inicia e registra GPS visto pelo aluno", async () => {
    const vr = await req("/vehicles", {
      name: "Integração",
      plate: "TST1A23",
      model: "Volare",
      year: 2025,
      capacity: 44,
      status: "available",
    });
    expect(vr.status).toBe(201);
    const vehicleId = ((await vr.json()) as { id: string }).id;
    const route = a.routes[0];
    const rr = await req("/routes", {
      name: "Rota integração",
      shift: "Manhã",
      description: "Teste",
      stops: route.stops.map((st, i) => ({ ...st, id: "integration-" + i })),
    });
    expect(rr.status).toBe(201);
    const routeId = ((await rr.json()) as { id: string }).id;
    const driver = a.drivers.find((d) => d.name === "Carlos Oliveira")!;
    const start = Date.now() + 86400000;
    const tr = await req("/trips", {
      name: "Viagem integração",
      routeId,
      vehicleId,
      driverId: driver.id,
      plannedStart: start,
      plannedEnd: start + 3600000,
    });
    expect(tr.status).toBe(201);
    const id = ((await tr.json()) as { id: string }).id;
    expect(
      (await req(`/trips/${id}/status`, { status: "in_progress" })).status,
    ).toBe(409);
    expect(
      (
        await req(
          `/trips/${a.trips.find((t) => t.driverId === driver.id)!.id}/status`,
          { status: "completed" },
        )
      ).status,
    ).toBe(200);
    expect(
      (await req(`/trips/${id}/status`, { status: "in_progress" })).status,
    ).toBe(200);
    const cookie = await persona("driver");
    const p = {
      lat: route.stops[0].lat,
      lng: route.stops[0].lng,
      accuracy: 5,
      timestamp: Date.now()-10000,
      speed: 5,
      heading: 0,
      source: "gps",
    };
    expect(
      (await req(`/trips/${id}/location`, p, "owner-a", cookie)).status,
    ).toBe(200);
    expect(
      (await req(`/trips/${id}/location`, p, "owner-a", cookie)).status,
    ).toBe(422);
    const s = await state();
    expect(s.locations.find((l) => l.tripId === id)?.position.source).toBe(
      "gps",
    );
    expect(s.estimates.find((e) => e.tripId === id)?.available).toBe(false);
  });
  it("aviso de pane interrompe e resolução retoma, sem acumular atraso", async () => {
    const t = (await state()).trips.find(
      (t) => t.name === "Viagem integração",
    )!;
    const notice = {
      tripId: t.id,
      category: "mechanical",
      message: "Pane fictícia para teste",
      delayMinutes: 10,
      simulated: true,
    };
    expect((await req("/notices", notice)).status).toBe(201);
    let s = await state();
    expect(s.trips.find((x) => x.id === t.id)?.status).toBe("interrupted");
    expect(s.trips.find((x) => x.id === t.id)?.delayUntil).toBeLessThan(
      Date.now() + 601000,
    );
    expect(
      (await req("/notices", { ...notice, category: "delay" })).status,
    ).toBe(201);
    s = await state();
    expect(s.trips.find((x) => x.id === t.id)?.delayUntil).toBeLessThan(
      Date.now() + 601000,
    );
    const incident = s.incidents.find((i) => i.tripId === t.id)!;
    expect(
      (
        await req(`/incidents/${incident.id}/resolve`, {
          resolution: "Inspeção concluída na simulação",
        })
      ).status,
    ).toBe(200);
    s = await state();
    expect(s.trips.find((x) => x.id === t.id)?.status).toBe("in_progress");
    expect(s.trips.find((x) => x.id === t.id)?.delayUntil).toBeNull();
  });
  it("espera é limitada, próxima à parada e não pode ser renovada", async () => {
    const t = (await state()).trips.find(
      (t) => t.name === "Viagem integração",
    )!;
    const wait = {
      stopId: t.snapshot.stops[0].id,
      seconds: 300,
      safeStop: true,
    };
    expect((await req(`/trips/${t.id}/wait`,wait)).status).toBe(409);
    const cookie=await persona("driver");
    expect((await req(`/trips/${t.id}/location`,{lat:t.snapshot.stops[0].lat,lng:t.snapshot.stops[0].lng,accuracy:4,timestamp:Date.now(),speed:0,heading:null,source:"gps"},"owner-a",cookie)).status).toBe(200);
    expect(
      (await req(`/trips/${t.id}/wait`, { ...wait, seconds: 301 })).status,
    ).toBe(422);
    expect((await req(`/trips/${t.id}/wait`, wait)).status).toBe(200);
    expect((await req(`/trips/${t.id}/wait`, wait)).status).toBe(409);
    expect(
      (await req(`/trips/${t.id}/wait`, { ...wait, seconds: 0 })).status,
    ).toBe(200);
    expect((await req(`/trips/${t.id}/wait`, wait)).status).toBe(409);
  });
  it("embarque exige operador autorizado, viagem e sequência corretos", async () => {
    const t = a.trips.find((t) => t.status === "paused")!,
      st = a.students.find((st) => st.routeId === t.routeId)!,
      cookie = await persona("monitor"),
      data = {
        tripId: t.id,
        studentId: st.id,
        stopId: st.stopId,
        kind: "alight",
      };
    expect((await req("/boarding", data, "owner-a", cookie)).status).toBe(409);
    expect(
      (await req("/boarding", { ...data, kind: "board" }, "owner-a", cookie))
        .status,
    ).toBe(201);
    expect(
      (await req("/boarding", { ...data, kind: "board" }, "owner-a", cookie))
        .status,
    ).toBe(409);
    expect((await req("/boarding", data, "owner-a", cookie)).status).toBe(201);
  });
  it("manutenção e despesas persistem e ficam restritas ao admin", async () => {
    const vehicle = a.vehicles.find((v) => v.status === "maintenance")!,
      m = a.maintenance[0];
    expect((await req(`/maintenance/${m.id}/complete`, {})).status).toBe(200);
    expect(
      (await state()).vehicles.find((v) => v.id === vehicle.id)?.status,
    ).toBe("available");
    expect(
      (
        await req("/expenses", {
          vehicleId: vehicle.id,
          category: "fuel",
          description: "Teste de combustível",
          date: "2026-11-03",
          amountCents: 10000,
        })
      ).status,
    ).toBe(201);
    const cookie = await persona("guardian");
    expect((await state("owner-a", cookie)).expenses).toHaveLength(0);
  });
  it("gera CSV e mantém histórico de operações", async () => {
    const r = await req("/reports.csv");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Viagem integração");
    expect((await state()).audit.length).toBeGreaterThan(5);
  });
});

describe('Smart Journey V3 e credenciais de aparelhos',()=>{
 async function join(){const result=await req('/journey/join',{schoolId:a.organization.id,name:'Visitante FECT'},'');expect(result.status).toBe(201);return result.headers.get('set-cookie')!.split(';')[0];}
 async function native(path:string,body:unknown|undefined,token?:string){return api.fetch(new Request(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),{DB});}
 it('entrada por nome gera acesso restrito; recusa perfil elevado, outra escola e rota oculta',async()=>{
 const cookie=await join();const result=await req('/journey/state',undefined,'',cookie);expect(result.status).toBe(200);const data=await result.json() as {name:string;routes:State['routes'];students?:unknown};expect(data.name).toBe('Visitante FECT');expect(data.students).toBeUndefined();expect(data.routes.every(r=>r.orgId===a.organization.id&&r.published)).toBe(true);
 expect((await req('/state',undefined,'owner-a',cookie)).status).toBe(403);expect((await req('/demo/profile',{role:'admin'},'owner-a',cookie)).status).toBe(403);
 const foreign=b.routes[0];expect((await req('/journey/select',{routeId:foreign.id,stopId:foreign.stops[0].id,favorite:true,notify:true},'',cookie)).status).toBe(404);
 const route=a.routes[0];await req(`/routes/${route.id}/visibility`,{published:false});expect((await req('/journey/select',{routeId:route.id,stopId:route.stops[0].id,favorite:true,notify:true},'',cookie)).status).toBe(404);await req(`/routes/${route.id}/visibility`,{published:true});
 expect((await req('/journey/leave',{},'',cookie)).status).toBe(200);expect((await req('/journey/state',undefined,'',cookie)).status).toBe(401);
 });
 it('prepara circuito repetível, salva preferência sem alterar alunos e calcula caminhada sobre ruas reais',async()=>{
 const initial=(await state()).students;expect((await req('/journey/prepare',{})).status).toBe(200);expect((await req('/journey/prepare',{})).status).toBe(200);
 const snap=await state(),routes=snap.routes.filter(r=>r.name.startsWith('Circuito Congretech'));expect(routes).toHaveLength(2);expect(snap.trips.filter(t=>routes.some(r=>r.id===t.routeId))).toHaveLength(2);
 const route=routes.find(r=>r.name.includes('GPS real'))!,cookie=await join();expect((await req('/journey/select',{routeId:route.id,stopId:route.stops[2].id,favorite:true,notify:true},'',cookie)).status).toBe(200);
 const response=await req('/journey/walk',{lat:route.stops[0].lat,lng:route.stops[0].lng},'',cookie);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({available:true,source:'osm-local',meters:727,recommendation:{status:'unavailable'}});expect((await state()).students).toEqual(initial);
 const outside=await req('/journey/walk',{lat:0,lng:0},'',cookie);expect(await outside.json()).toMatchObject({available:false});
 });
 it('pareamento único, GPS autorizado, leitura por visitante e fim de transmissão ao encerrar viagem',async()=>{
 const snap=await state(),trip=snap.trips.find(t=>t.name.includes('Circuito Congretech')&&t.trackingMode==='gps')!,fake=snap.trips.find(t=>t.trackingMode==='simulation')!;
 const pair=await req('/driver/pair',{driverId:trip.driverId});expect(pair.status).toBe(200);const code=(await pair.json() as {code:string}).code;
 const grant=await native('/driver/exchange',{code});expect(grant.status).toBe(200);const token=(await grant.json() as {token:string}).token;expect((await native('/driver/exchange',{code})).status).toBe(401);expect((await native('/state',undefined,token)).status).toBe(403);expect((await native(`/trips/${fake.id}/status`,{status:'paused'},token)).status).toBe(404);
 expect((await native(`/trips/${trip.id}/status`,{status:'in_progress'},token)).status).toBe(200);expect((await req(`/trips/${trip.id}/simulate`,{speed:7})).status).toBe(409);
 const p={lat:trip.snapshot.stops[0].lat,lng:trip.snapshot.stops[0].lng,speed:3,accuracy:5,timestamp:Date.now(),heading:90,source:'gps'};expect((await native(`/trips/${trip.id}/location`,p,token)).status).toBe(200);
 const cookie=await join();await req('/journey/select',{routeId:trip.routeId,stopId:trip.snapshot.stops[2].id,favorite:true,notify:true},'',cookie);
 const journey=await req('/journey/state',undefined,'',cookie);expect(await journey.json()).toMatchObject({position:{source:'gps'},eta:{available:true,simulated:false},trip:{id:trip.id}});
 expect((await req(`/trips/${trip.id}/location`,p,'',cookie)).status).toBe(403);expect((await native(`/trips/${trip.id}/status`,{status:'completed'},token)).status).toBe(200);expect((await native(`/trips/${trip.id}/location`,p,token)).status).toBe(409);await native('/driver/revoke',{},token);expect((await native('/driver/trips',undefined,token)).status).toBe(401);
 });
 it('reconcilia prazo de espera uma única vez mesmo com leituras simultâneas',async()=>{
 const t=a.trips.find(t=>t.status==='paused')!;await DB.prepare('UPDATE trips SET wait_until=?,wait_stop_id=? WHERE id=?').bind(Date.now()-2000,t.snapshot.stops[0].id,t.id).run();await Promise.all([state(),state()]);const data=await state();expect(data.trips.find(x=>x.id===t.id)?.waitUntil).toBeNull();expect(data.notices.filter(n=>n.tripId===t.id&&n.category==='wait_ended')).toHaveLength(1);
 });
 it('validar origem, limites de sessão, push e fechamento da sala',async()=>{
 const cookie=await join();expect((await req('/journey/push',{endpoint:'https://127.0.0.1/',enabled:true},'',cookie)).status).toBe(422);expect((await req('/journey/join',{schoolId:a.organization.id,name:'Pessoa',role:'admin'},'')).status).toBe(422);
 expect((await req('/journey/select',{routeId:'x'},'',cookie,'https://invalid.test')).status).toBe(403);expect((await req('/journey/room',{roomOpen:false,safetyMargin:3})).status).toBe(200);expect((await req('/journey/state',undefined,'',cookie)).status).toBe(401);expect((await req('/journey/join',{schoolId:a.organization.id,name:'Pessoa'},'')).status).toBe(404);
 expect((await req('/retention',{})).status).toBe(200);
 });
});
