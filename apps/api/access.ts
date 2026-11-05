import {and,eq,gt,sql} from "drizzle-orm";
import type {DrizzleD1Database} from "drizzle-orm/d1";
import {HTTPException} from "hono/http-exception";
import * as s from "../../db/schema";
export type DB=DrizzleD1Database;
export const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
export const opaque=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
export async function limit(db:DB,bucket:string,max:number){
 const now=Date.now(),id=bucket+":"+Math.floor(now/60000);
 const [row]=await db.insert(s.rateLimits).values({id,count:1,expires:now+86400000}).onConflictDoUpdate({target:s.rateLimits.id,set:{count:sql`${s.rateLimits.count}+1`}}).returning();
 if(row.count>max) throw new HTTPException(429,{message:"Muitas tentativas. Aguarde um minuto."});
}
export async function session(db:DB,value:string,kind:"visitor"|"device"){
 if(!/^[a-f0-9]{64}$/.test(value))return null;
 const [row]=await db.select().from(s.accessSessions).where(and(eq(s.accessSessions.id,await digest(value)),eq(s.accessSessions.kind,kind),gt(s.accessSessions.expires,Date.now())));
 if(!row)return null;
 const [org]=await db.select().from(s.organizations).where(eq(s.organizations.id,row.orgId));
 if(!org || (kind==="visitor"&&(!org.demo||!org.roomOpen)))return null;
 if(kind==="device"){
  const [driver]=await db.select().from(s.drivers).where(and(eq(s.drivers.userId,row.subject),eq(s.drivers.orgId,row.orgId),eq(s.drivers.status,"active")));
  if(!driver)return null;
  const [member]=await db.select().from(s.memberships).where(and(eq(s.memberships.userId,row.subject),eq(s.memberships.orgId,row.orgId)));
  if((!org.demo&&!member)||member&&(!member.active||member.role!=="driver"))return null;
 }
 return {orgId:org.id,userId:row.subject,ownerId:row.subject,name:row.name,role:kind==="visitor"?"student" as const:"driver" as const,demo:org.demo,visitor:kind==="visitor"};
}

