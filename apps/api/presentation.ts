import {and,eq} from "drizzle-orm";
import {HTTPException} from "hono/http-exception";
import type {DB} from "./access";
import * as s from "../../db/schema";
import {calculateLocalRoute} from "../../packages/geodata";
const points=[{lat:-12.9978788,lng:-38.5130599,name:"Rua Caetano Moura · partida"},{lat:-12.9990528,lng:-38.5110559,name:"Ponto intermediário"},{lat:-12.9967469,lng:-38.5076226,name:"Rua Caetano Moura · chegada"}];
export async function preparePresentation(db:DB,orgId:string){
 const geometry=calculateLocalRoute(points,"bus");if(!geometry)throw new HTTPException(503,{message:"Circuito de demonstração indisponível"});
 for(const mode of ["gps","simulation"] as const){
 const prefix=orgId+":fect:"+mode,routeId=prefix+":r",vehicleId=prefix+":v",driverId=prefix+":d",name="Circuito Congretech · "+(mode==="gps"?"GPS real":"Simulação"),stops=points.map((p,i)=>({...p,id:prefix+":p"+i,dwellSeconds:30})),snapshot={name,stops,geometry:geometry.geometry,routed:true};
 await db.batch([db.insert(s.routes).values({...snapshot,id:routeId,orgId,shift:"Manhã",published:true,description:"Circuito de apresentação na Rua Caetano Moura, Salvador. Validar o local com a organização antes do ensaio."}).onConflictDoNothing(),
 db.insert(s.routeVersions).values({id:prefix+":version1",orgId,routeId,version:1,snapshot,createdAt:Date.now()}).onConflictDoNothing(),
 db.insert(s.vehicles).values({id:vehicleId,orgId,name:"TrackBus "+(mode==="gps"?"Campo":"Simulador"),plate:mode==="gps"?"FEC3A01":"FEC3A02",model:"Veículo demonstrativo",year:2026,capacity:30,status:"available"}).onConflictDoNothing(),
 db.insert(s.drivers).values({id:driverId,orgId,name:mode==="gps"?"Motorista da apresentação":"Operador do simulador",userId:prefix+":operator",status:"active"}).onConflictDoNothing()]);
 const [route]=await db.select().from(s.routes).where(and(eq(s.routes.id,routeId),eq(s.routes.orgId,orgId)));
 const trips=await db.select().from(s.trips).where(and(eq(s.trips.orgId,orgId),eq(s.trips.routeId,routeId)));
 if(!trips.some(t=>!["completed","cancelled"].includes(t.status))){
 const now=Date.now();await db.insert(s.trips).values({id:prefix+":trip"+(trips.length+1),orgId,routeId,vehicleId,driverId,name,trackingMode:mode,plannedStart:now,plannedEnd:now+3600000,snapshot:{name:route.name,stops:route.stops,geometry:route.geometry,routed:route.routed}}).onConflictDoNothing();
 }
 }
 await db.update(s.organizations).set({roomOpen:true}).where(and(eq(s.organizations.id,orgId),eq(s.organizations.demo,true)));
}

