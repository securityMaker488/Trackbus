import { beforeAll, describe, it, expect, vi } from "vitest";
import { createAccessVerifier } from "../../apps/api/cloudflare-identity";
let privateKey: CryptoKey, jwk: JsonWebKey;
const config = {
    ACCESS_TEAM_DOMAIN: "trackbus-test.cloudflareaccess.com",
    ACCESS_AUD: "demo-audience",
  },
  now = 1800000000000;
const encode = (x: unknown) =>
  Buffer.from(JSON.stringify(x)).toString("base64url");
async function token(
  changes: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const data =
    encode({ alg: "RS256", kid: "key-1", typ: "JWT", ...header }) +
    "." +
    encode({
      iss: "https://" + config.ACCESS_TEAM_DOMAIN,
      aud: [config.ACCESS_AUD],
      sub: "human-1",
      email: "Admin@example.test",
      type: "app",
      iat: now / 1000 - 10,
      exp: now / 1000 + 3600,
      ...changes,
    });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(data),
  );
  return data + "." + Buffer.from(signature).toString("base64url");
}
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
  privateKey = pair.privateKey;
  jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});
describe("Cloudflare Access sem confiar em headers declarativos", () => {
  it("verifica assinatura e identidade humana; reutiliza JWKS por prazo limitado", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json({ keys: [{ ...jwk, kid: "key-1" }] }),
      ),
      verify = createAccessVerifier(fetcher),
      signed = await token();
    expect(await verify(signed, config, now)).toMatchObject({
      id: "cf-access:human-1",
      email: "admin@example.test",
    });
    await verify(signed, config, now + 1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://trackbus-test.cloudflareaccess.com/cdn-cgi/access/certs",
    );
  });
  it("rejeita token adulterado, algoritmo errado e chave desconhecida", async () => {
    const verify = createAccessVerifier(async () =>
      Response.json({ keys: [{ ...jwk, kid: "key-1" }] }),
    );
    const signed = await token(),
      [a, b, c] = signed.split(".");
    await expect(
      verify(
        a + "." + b + "." + (c[0] === "A" ? "B" : "A") + c.slice(1),
        config,
        now,
      ),
    ).rejects.toThrow();
    for (const h of [{ alg: "none" }, { alg: "HS256" }, { kid: "unknown" }])
      await expect(verify(await token({}, h), config, now)).rejects.toThrow();
  });
  it("rejeita emissor, audience, validade, serviço e claims incompletos", async () => {
    const verify = createAccessVerifier(async () =>
      Response.json({ keys: [{ ...jwk, kid: "key-1" }] }),
    );
    for (const claim of [
      { iss: "https://evil.test" },
      { aud: ["other"] },
      { exp: now / 1000 - 1 },
      { nbf: now / 1000 + 100 },
      { iat: now / 1000 + 100 },
      { email: undefined },
      { sub: "" },
      { type: "service" },
    ])
      await expect(verify(await token(claim), config, now)).rejects.toThrow();
  });
  it("falha fechado sem configuração e sem chaves disponíveis", async () => {
    const fetcher = vi.fn<typeof fetch>(
        async () => new Response(null, { status: 503 }),
      ),
      verify = createAccessVerifier(fetcher),
      signed = await token();
    await expect(verify(signed, {}, now)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(verify(signed, config, now)).rejects.toThrow();
  });
});
