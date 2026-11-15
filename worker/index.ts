import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { verifyAccessIdentity } from "../apps/api/cloudflare-identity";

const worker = {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    if (
      env.AUTH_PROVIDER === "cloudflare-access" &&
      new URL(request.url).pathname === "/entrar"
    ) {
      if (request.method !== "GET")
        return new Response("Método não permitido", { status: 405 });
      try {
        await verifyAccessIdentity(
          request.headers.get("Cf-Access-Jwt-Assertion") ||
            request.headers
              .get("cookie")
              ?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ||
            "",
          env,
        );
      } catch (error) {
        // Log only known failure categories, never tokens, claims or cookies.
        const categories = new Set([
          "JWT inválido",
          "Cloudflare Access não configurado",
          "Identidade temporariamente indisponível",
          "Consulta de chaves indisponível",
          "Chave criptográfica inválida",
          "Chaves inválidas",
          "Chave de identidade desconhecida",
          "Assinatura inválida",
          "Sessão de identidade inválida ou expirada",
        ]);
        console.warn("access_login_rejected", {
          reason:
            error instanceof Error && categories.has(error.message)
              ? error.message
              : "Falha ao verificar identidade",
          errorType:
            error instanceof Error &&
            ["Error", "TypeError", "SyntaxError", "DOMException"].includes(
              error.name,
            )
              ? error.name
              : "Other",
        });
        return new Response(
          "Acesso não autorizado. Entre pela aplicação Cloudflare Access configurada para /entrar.",
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }
      const headers = new Headers({
        Location: "/",
        "Cache-Control": "no-store",
      });
      for (const cookie of ["tb_visitor", "tb_demo", "tb_driver"])
        headers.append(
          "Set-Cookie",
          `${cookie}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
        );
      return new Response(null, { status: 303, headers });
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () =>
      handler.fetch(request, env, ctx),
    );
    const secured = new Response(response.body, response);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set(
      "Permissions-Policy",
      "geolocation=(self), camera=(), microphone=()",
    );
    if (!import.meta.env.DEV) {
      secured.headers.set("Strict-Transport-Security", "max-age=31536000");
      secured.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
      );
    }
    return secured;
  },
};

export default worker;
