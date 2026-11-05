import {describe,it,expect} from "vitest";
import {eventGateway} from "../../worker/event-gateway";
import {validEndpoint} from "../../apps/api/notifications";
const env={SITE_ORIGIN:"https://example.chatgpt.site",SITE_SERVICE_TOKEN:"fixture-only"};
describe("gateway de participantes",()=>{
 it("nega gestão e origens cruzadas antes da rede",async()=>{
   let sent=false;const transport=async()=>{sent=true;return new Response();};
   expect((await eventGateway(new Request("https://event.test/api/bootstrap",{method:"POST"}),env,transport)).status).toBe(404);
   expect((await eventGateway(new Request("https://event.test/api/journey/join",{method:"POST",headers:{Origin:"https://outside.test"}}),env,transport)).status).toBe(403);
   expect(sent).toBe(false);
 });
 it("descarta identidade, cookies privilegiados e credenciais retornadas pela origem",async()=>{
  const request=new Request("https://event.test/api/journey/state",{headers:{"oai-authenticated-user-id":"forged",Cookie:"tb_demo=fake; tb_visitor="+"a".repeat(64),"OAI-Sites-Authorization":"injected"}});
  const result=await eventGateway(request,env,async(initial,options)=>{const h=new Headers(options?.headers);expect(String(initial)).toBe("https://example.chatgpt.site/api/journey/state");expect(h.get("oai-authenticated-user-id")).toBeNull();expect(h.get("Cookie")).toBe("tb_visitor="+"a".repeat(64));expect(h.get("OAI-Sites-Authorization")).toBe("Bearer fixture-only");return new Response("ok",{headers:{"Set-Cookie":"tb_demo=fake"}});});
  expect(result.headers.get("Set-Cookie")).toBeNull();
 });
 it("não segue redirecionamento da origem nem aceita endpoints push arbitrários",async()=>{
  expect((await eventGateway(new Request("https://event.test/api/health"),env,async()=>Response.redirect("https://outside.test"))).status).toBe(502);
  expect(validEndpoint("https://fcm.googleapis.com/fcm/send/fixture")).toBe(true);
  for(const url of ["https://fcm.googleapis.com.evil.test","https://127.0.0.1","http://fcm.googleapis.com","https://user@updates.push.services.mozilla.com","https://push.apple.com.evil.test"])expect(validEndpoint(url)).toBe(false);
 });
});
