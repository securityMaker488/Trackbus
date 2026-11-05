import {and,desc,eq,inArray} from "drizzle-orm";
import {HTTPException} from "hono/http-exception";
import * as s from "../../db/schema";
import {estimateArrival,departure,type Point} from "../../packages/domain";
import {calculateRoute} from "./routing";
import {calculateLocalRoute} from "../../packages/geodata";
import type {DB} from "./access";
export type JourneyActor={orgId:string;userId:string;name:string;role:string;visitor?:boolean};
export async function schoolRoutes(db:DB,orgId:string){
 return db.select().from(s.routes).where(and(eq(s.routes.orgId,orgId),eq(s.routes.published,true),eq(s.routes.active,true))).limit(500);
}
export async function journeyState(db:DB,actor:JourneyActor){
 const [org]=await db.select().from(s.organizations).where(eq(s.organizations.id,actor.orgId));
 const routes=await schoolRoutes(db,actor.orgId),routeIds=routes.map(r=>r.id);
 const preferences=(await db.select().from(s.journeyPreferences).where(and(eq(s.journeyPreferences.orgId,actor.orgId),eq(s.journeyPreferences.subject,actor.userId)))).filter(x=>routeIds.includes(x.routeId));
 const selected=preferences.find(x=>x.selected), all=routeIds.length?await db.select().from(s.trips).where(and(eq(s.trips.orgId,actor.orgId),inArray(s.trips.routeId,routeIds))).orderBy(desc(s.trips.plannedStart)).limit(500):[];
 const trips=all.map(t=>({id:t.id,name:t.name,status:t.status,routeId:t.routeId,plannedStart:t.plannedStart,waitUntil:t.waitUntil,trackingMode:t.trackingMode,plannedEnd:t.plannedEnd}));
 const active=all.filter(t=>t.routeId===selected?.routeId&&!["completed","cancelled"].includes(t.status));
 const trip=active.find(t=>t.status!=="scheduled")||active.sort((a,b)=>a.plannedStart-b.plannedStart)[0];
 const location=trip?(await db.select().from(s.locations).where(and(eq(s.locations.orgId,actor.orgId),eq(s.locations.tripId,trip.id))))[0]?.position:null;
 const eta=trip?estimateArrival({position:location??null,itinerary:trip.snapshot,stopId:selected?.stopId,status:trip.status,delayUntil:trip.delayUntil,waitUntil:trip.waitUntil,now:Date.now()}):null;
 const noticeIds=all.filter(t=>t.routeId===selected?.routeId).map(t=>t.id);
 const notices=noticeIds.length?await db.select({id:s.notices.id,category:s.notices.category,message:s.notices.message,simulated:s.notices.simulated,createdAt:s.notices.createdAt}).from(s.notices).where(and(eq(s.notices.orgId,actor.orgId),inArray(s.notices.tripId,noticeIds))).orderBy(desc(s.notices.createdAt)).limit(40):[];
 return {name:actor.name,school:org.name,margin:org.safetyMargin,routes,preferences,trips,trip:trip?{id:trip.id,name:trip.name,status:trip.status,snapshot:trip.snapshot,waitUntil:trip.waitUntil}:null,position:location||null,eta,notices,serverTime:Date.now()};
}
export async function saveSelection(db:DB,actor:JourneyActor,choice:{routeId:string;stopId:string;favorite:boolean;notify:boolean}){
 const route=(await schoolRoutes(db,actor.orgId)).find(r=>r.id===choice.routeId);
 if(!route?.stops.some(s=>s.id===choice.stopId))throw new HTTPException(404,{message:"Rota ou parada indisponível nesta escola"});
 const record={...choice,id:crypto.randomUUID(),orgId:actor.orgId,subject:actor.userId,selected:true};
 await db.batch([db.update(s.journeyPreferences).set({selected:false}).where(and(eq(s.journeyPreferences.subject,actor.userId),eq(s.journeyPreferences.orgId,actor.orgId))),db.insert(s.journeyPreferences).values(record).onConflictDoUpdate({target:[s.journeyPreferences.orgId,s.journeyPreferences.subject,s.journeyPreferences.routeId],set:{...choice,selected:true}})]);
}
export async function walkToSelection(db:DB,actor:JourneyActor,position:Point,endpoint?:string){
 const state=await journeyState(db,actor),pref=state.preferences.find(p=>p.selected);
 const route=state.routes.find(r=>r.id===pref?.routeId),stop=(state.trip?.snapshot.stops||route?.stops||[]).find(s=>s.id===pref?.stopId);
 if(!stop)throw new HTTPException(409,{message:"Selecione uma rota e parada disponíveis"});
 const local=calculateLocalRoute([position,stop],"pedestrian");
 if(!local&&!endpoint)return {available:false,reason:"Fora da cobertura caminhável ou sem conexão por vias públicas."};
 try{
 const walking=local??await calculateRoute(endpoint!,[position,stop],"pedestrian");
 return {available:true,...walking,margin:state.margin,recommendation:departure(state.eta?.minMinutes??null,walking.seconds,state.margin)};
 }catch{return {available:false,reason:"Não foi possível obter um percurso caminhável."};}
}

