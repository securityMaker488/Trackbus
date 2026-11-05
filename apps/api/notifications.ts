import {and,eq,gt,isNull,ne,or} from "drizzle-orm";
import type {DB} from "./access";
import * as s from "../../db/schema";
type PushEnv={VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_JWK?:string;VAPID_SUBJECT?:string};
export function validEndpoint(endpoint:string){
 try{const u=new URL(endpoint);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&(u.hostname==="fcm.googleapis.com"||u.hostname==="updates.push.services.mozilla.com"||u.hostname.endsWith(".push.apple.com")||u.hostname.endsWith(".notify.windows.com"));}catch{return false;}
}
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const part=(v:unknown)=>base64(new TextEncoder().encode(JSON.stringify(v)));
async function wake(endpoint:string,env:PushEnv){
 const key=await crypto.subtle.importKey("jwk",JSON.parse(env.VAPID_PRIVATE_JWK!),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const unsigned=part({typ:"JWT",alg:"ES256"})+"."+part({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+300,sub:env.VAPID_SUBJECT});
 const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(unsigned));
 return fetch(endpoint,{method:"POST",redirect:"error",headers:{TTL:"120",Authorization:"vapid t="+unsigned+"."+base64(new Uint8Array(signature))+", k="+env.VAPID_PUBLIC_KEY},signal:AbortSignal.timeout(3500)});
}
export async function deliver(db:DB,env:PushEnv,trip:typeof s.trips.$inferSelect,id:string){
 if(!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY||!env.VAPID_SUBJECT)return;
 const [route]=await db.select().from(s.routes).where(and(eq(s.routes.id,trip.routeId),eq(s.routes.orgId,trip.orgId),eq(s.routes.published,true),eq(s.routes.active,true)));
 if(!route)return;
 const rows=await db.select({sub:s.pushSubscriptions}).from(s.pushSubscriptions).innerJoin(s.journeyPreferences,and(eq(s.journeyPreferences.orgId,s.pushSubscriptions.orgId),eq(s.journeyPreferences.subject,s.pushSubscriptions.subject))).where(and(eq(s.pushSubscriptions.orgId,trip.orgId),gt(s.pushSubscriptions.expires,Date.now()),eq(s.journeyPreferences.routeId,route.id),eq(s.journeyPreferences.selected,true),eq(s.journeyPreferences.notify,true))).limit(50);
 for(let i=0;i<rows.length;i+=8)await Promise.allSettled(rows.slice(i,i+8).map(async({sub})=>{
  if(!validEndpoint(sub.endpoint))return;
  const changed=await db.update(s.pushSubscriptions).set({lastNotice:id}).where(and(eq(s.pushSubscriptions.id,sub.id),or(isNull(s.pushSubscriptions.lastNotice),ne(s.pushSubscriptions.lastNotice,id)))).returning();
  if(!changed.length)return;
  const result=await wake(sub.endpoint,env);
  if([404,410].includes(result.status))await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id,sub.id));
 }));
}
// Expiry is reconciled on the next authorized read. Conditional inserts and the
// clearing update share a transaction, so concurrent polls record one ending.
export async function expireWaits(DB:D1Database,org:string){
 const now=Date.now(),due=await DB.prepare("SELECT id,wait_until FROM trips WHERE org_id=? AND wait_until IS NOT NULL AND wait_until<=? LIMIT 50").bind(org,now).all<{id:string;wait_until:number}>();
 for(const t of due.results){
  const match=" FROM trips WHERE id=? AND org_id=? AND wait_until=?";
  const eventId=t.id+":wait-end:"+t.wait_until;
  await DB.batch([DB.prepare("INSERT OR IGNORE INTO trip_events (id,org_id,actor_id,trip_id,type,message,simulated,created_at) SELECT ?,org_id,'trackbus',id,'wait_ended','Prazo de espera encerrado',tracking_mode='simulation',?"+match).bind(eventId,t.wait_until,t.id,org,t.wait_until),DB.prepare("INSERT OR IGNORE INTO notices (id,org_id,actor_id,trip_id,category,message,simulated,created_at) SELECT ?,org_id,'trackbus',id,'wait_ended','Prazo de espera encerrado',tracking_mode='simulation',?"+match).bind(eventId,t.wait_until,t.id,org,t.wait_until),DB.prepare("UPDATE trips SET wait_until=NULL,wait_stop_id=NULL,revision=revision+1 WHERE id=? AND org_id=? AND wait_until=?").bind(t.id,org,t.wait_until)]);
 }
}

