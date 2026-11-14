import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let mf: Miniflare, signed: string;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const data =
    encode({ alg: "RS256", kid: "runtime-key", typ: "JWT" }) +
    "." +
    encode({
      iss: "https://test.cloudflareaccess.com",
      aud: ["runtime-aud"],
      type: "app",
      sub: "owner",
      email: "owner@example.test",
      iat: now - 5,
      exp: now + 300,
    });
  signed =
    data +
    "." +
    Buffer.from(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        pair.privateKey,
        new TextEncoder().encode(data),
      ),
    ).toString("base64url");
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
      import {createAccessVerifier} from './apps/api/cloudflare-identity.ts';
      export default {async fetch(request, env) {
        const verify=createAccessVerifier(async(url, options)=>{
          new Request(url, options); // Workerd validates supported fetch options.
          return request.headers.has('test-redirect')
            ? new Response(null,{status:302,headers:{Location:'https://other.test/keys'}})
            : Response.json({keys:[JSON.parse(env.KEY)]});
        });
        try { return Response.json(await verify(await request.text(),{
          ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'runtime-aud'
        })); } catch {return new Response('Unauthorized',{status:401});}
      }};
    `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-11-01",
      compatibilityFlags: ["nodejs_compat"],
      bindings: { KEY: JSON.stringify({ ...jwk, kid: "runtime-key" }) },
    }),
  );
});
afterAll(async () => {
  await mf?.dispose();
});

it("verifica JWT no runtime Workers com opções de rede compatíveis", async () => {
  const response = await mf.dispatchFetch("https://test.local", {
    method: "POST",
    body: signed,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: "cf-access:owner",
    email: "owner@example.test",
  });
});
it("recusa redirecionamento de chaves sem seguir outro servidor", async () => {
  const response = await mf.dispatchFetch("https://test.local", {
    method: "POST",
    body: signed,
    headers: { "test-redirect": "yes" },
  });
  expect(response.status).toBe(401);
});
