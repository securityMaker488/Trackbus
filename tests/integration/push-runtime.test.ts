import { it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createECDH, randomBytes } from "node:crypto";
it("gera Web Push cifrado no runtime real Workers sem enviar a terceiros", async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {pushRequest} from './apps/api/push.ts';export default {async fetch(request,env){const data=await request.json();const p=await pushRequest(data.sub,data.env,{body:'Runtime confidencial'});return Response.json({encoding:new Headers(p.headers).get('content-encoding'),length:p.body.byteLength,exposed:new TextDecoder().decode(p.body).includes('Runtime confidencial')});}}`,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-11-01",
      compatibilityFlags: ["nodejs_compat"],
    }),
  );
  try {
    const server = createECDH("prime256v1"),
      vapid = {
        publicKey: server.generateKeys().toString("base64url"),
        privateKey: server.getPrivateKey().toString("base64url"),
      },
      ecdh = createECDH("prime256v1");
    const response = await mf.dispatchFetch("https://push.test", {
      method: "POST",
      body: JSON.stringify({
        sub: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test",
          p256dh: ecdh.generateKeys().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
        env: {
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_JWK: JSON.stringify({ d: vapid.privateKey }),
          VAPID_SUBJECT: "https://trackbus.test",
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      encoding: "aes128gcm",
      exposed: false,
    });
  } finally {
    await mf.dispose();
  }
});
