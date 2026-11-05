/** Optional participant endpoint. The main Site stays private. Deploy this
 * separately in an authorized Cloudflare account with a server-side secret. */
type Environment={SITE_ORIGIN:string;SITE_SERVICE_TOKEN:string};
const readOnly=/^\/(?:$|favicon\.svg$|icon-(?:192|512)\.png$|manifest\.webmanifest$|offline\.html$|sw\.js$|map-worker-v6\.mjs$|_next\/static\/[\w./-]+$|api\/(?:health|me|journey\/(?:schools|state)|driver\/(?:trips|incidents))$)/;
const writes=/^\/api\/(?:journey\/(?:join|leave|select|walk|push)|driver\/(?:exchange|revoke)|trips\/[\w:%-]+\/(?:status|location|wait)|notices|incidents\/[\w:%-]+\/resolve)$/;
export async function eventGateway(request:Request,env:Environment,transport:typeof fetch=fetch){
 const url=new URL(request.url),path=url.pathname;
 if(!env.SITE_SERVICE_TOKEN||!env.SITE_ORIGIN)return new Response("Gateway de demonstração não configurado",{status:503});
 if(!(request.method==="GET"&&readOnly.test(path)||request.method==="POST"&&writes.test(path)))return new Response("Recurso fora da apresentação",{status:404});
 // Browser cookie writes must originate here. Native device requests have no
 // Origin and use a one-use pairing grant or their scoped Authorization token.
 const native=!request.headers.has("Origin")&&(path==="/api/driver/exchange"||request.headers.get("Authorization")?.startsWith("Bearer "));
 if(request.method==="POST"&&!native&&request.headers.get("Origin")!==url.origin)return new Response("Origem não autorizada",{status:403});
 const target=new URL(env.SITE_ORIGIN);if(target.protocol!=="https:"||!target.hostname.endsWith(".chatgpt.site"))return new Response("Origem inválida",{status:503});
 const headers=new Headers();for(const name of ["accept","content-type","authorization","if-none-match"]){const v=request.headers.get(name);if(v)headers.set(name,v);}
 headers.set("OAI-Sites-Authorization","Bearer "+env.SITE_SERVICE_TOKEN);
 const visitor=request.headers.get("Cookie")?.split(/;\s*/).find(s=>/^tb_visitor=[a-f0-9]{64}$/.test(s));if(visitor)headers.set("Cookie",visitor);
 if(request.method==="POST"&&!native)headers.set("Origin",target.origin);
 target.pathname=path;target.search=url.search;
 const upstream=await transport(target,{method:request.method,headers,body:request.method==="POST"?request.body:undefined,redirect:"manual"});
 if(upstream.status>=300&&upstream.status<400)return new Response("Redirecionamento da origem recusado",{status:502});
 const response=new Response(upstream.body,upstream);
 const cookie=upstream.headers.get("Set-Cookie");response.headers.delete("Set-Cookie");if(cookie?.startsWith("tb_visitor="))response.headers.set("Set-Cookie",cookie);
 response.headers.delete("OAI-Sites-Authorization");return response;
}
export default {fetch(request:Request,env:Environment){return eventGateway(request,env);}};

