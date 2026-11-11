export type AccessConfig = {
  AUTH_PROVIDER?: "sites" | "cloudflare-access";
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  INITIAL_ADMIN_EMAIL?: string;
};
type Key = JsonWebKey & { kid?: string };
export type AccessIdentity = { id: string; email: string; name: string };
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error("JWT inválido");
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
/** Keys are fetched only from the configured Access team; unverified claims never select a URL. */
export function createAccessVerifier(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const cache = new Map<
    string,
    { keys: Key[]; expires: number; checked: number }
  >();
  return async (
    token: string,
    config: AccessConfig,
    now = Date.now(),
  ): Promise<AccessIdentity> => {
    const domain = config.ACCESS_TEAM_DOMAIN,
      aud = config.ACCESS_AUD;
    if (
      !domain ||
      !/^[a-z0-9](?:[a-z0-9-]{0,62})\.cloudflareaccess\.com$/.test(domain) ||
      !aud
    )
      throw Error("Cloudflare Access não configurado");
    if (token.length > 16384) throw Error("JWT inválido");
    const parts = token.split(".");
    if (parts.length !== 3) throw Error("JWT inválido");
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as {
      alg?: string;
      kid?: string;
      typ?: string;
    };
    if (
      header.alg !== "RS256" ||
      !header.kid ||
      header.kid.length > 200 ||
      (header.typ && header.typ !== "JWT")
    )
      throw Error("JWT inválido");
    let cached = cache.get(domain);
    if (
      !cached ||
      cached.expires <= now ||
      (!cached.keys.some((k) => k.kid === header.kid) &&
        now - cached.checked >= 30000)
    ) {
      const response = await fetcher(`https://${domain}/cdn-cgi/access/certs`, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw Error("Identidade temporariamente indisponível");
      const text = await response.text();
      if (text.length > 65536) throw Error("Chaves inválidas");
      const body = JSON.parse(text) as { keys?: Key[] };
      if (!Array.isArray(body.keys) || body.keys.length > 20)
        throw Error("Chaves inválidas");
      cached = { keys: body.keys, expires: now + 300000, checked: now };
      if (cache.size >= 8 && !cache.has(domain)) cache.clear();
      cache.set(domain, cached);
    }
    const jwk = cached.keys.find(
      (k) =>
        k.kid === header.kid &&
        k.kty === "RSA" &&
        (!k.alg || k.alg === "RS256") &&
        (!k.use || k.use === "sig"),
    );
    if (!jwk) throw Error("Chave de identidade desconhecida");
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        decode(parts[2]),
        new TextEncoder().encode(parts[0] + "." + parts[1]),
      ))
    )
      throw Error("Assinatura inválida");
    const claims = JSON.parse(
        new TextDecoder().decode(decode(parts[1])),
      ) as Record<string, unknown>,
      seconds = now / 1000;
    if (
      claims.iss !== `https://${domain}` ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(aud) ||
      claims.type !== "app" ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= seconds ||
      typeof claims.iat !== "number" ||
      !Number.isFinite(claims.iat) ||
      claims.iat > seconds + 30 ||
      claims.exp <= claims.iat ||
      (claims.nbf !== undefined &&
        (typeof claims.nbf !== "number" ||
          !Number.isFinite(claims.nbf) ||
          claims.nbf > seconds + 30)) ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim() ||
      claims.sub.length > 130 ||
      typeof claims.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(claims.email) ||
      claims.email.length > 254
    )
      throw Error("Sessão de identidade inválida ou expirada");
    const email = claims.email.toLowerCase();
    return { id: "cf-access:" + claims.sub, email, name: email };
  };
}
export const verifyAccessIdentity = createAccessVerifier();
