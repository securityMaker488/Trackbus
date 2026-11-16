import { readFileSync } from "node:fs";
import ts from "typescript";
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.cloudflare.jsonc",
  readFileSync("wrangler.cloudflare.jsonc", "utf8"),
);
if (parsed.error)
  throw Error("Configuração Cloudflare inválida: revise a sintaxe JSONC.");
const config = parsed.config;
const vars = config.vars || {},
  db = config.d1_databases?.find((d) => d.binding === "DB");
const pending = [];
const isolatedEvaluation =
  config.name === "trackbus-demonstracao" &&
  db?.database_name === "trackbus-demo" &&
  db?.database_id === "9d5746f5-81f9-4878-9984-3765e60cca8c" &&
  vars.APP_ENV === "evaluation";
if (
  (vars.GOOGLE_MAPS_MODE === "demo" && !isolatedEvaluation) ||
  vars.APP_ENV === "development" ||
  (vars.APP_ENV === "evaluation" && !isolatedEvaluation)
)
  pending.push(
    "Demo Key remota exige o Worker e D1 isolados de avaliação; nunca produção",
  );
if (Object.keys(vars).some((key) => /KEY|SECRET|PRIVATE/.test(key)))
  pending.push(
    "Credenciais devem usar Wrangler secrets, nunca vars versionadas",
  );
if (
  config.assets?.binding !== "ASSETS" ||
  !Array.isArray(config.assets?.run_worker_first) ||
  !config.assets.run_worker_first.includes("/api/*") ||
  !config.assets.run_worker_first.includes("/entrar")
)
  pending.push("Roteamento de assets e API conforme modelo V7");
if (
  !db?.database_id ||
  db.database_id === "00000000-0000-4000-8000-000000000000"
)
  pending.push("ID real do D1");
if (vars.AUTH_PROVIDER !== "cloudflare-access")
  pending.push("AUTH_PROVIDER=cloudflare-access");
if (
  !/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(
    vars.ACCESS_TEAM_DOMAIN || "",
  )
)
  pending.push("Domínio da equipe Access");
if (!vars.ACCESS_AUD || vars.ACCESS_AUD.includes("CONFIGURAR"))
  pending.push("Audience da aplicação Access");
if (!/^\S+@\S+\.\S+$/.test(vars.INITIAL_ADMIN_EMAIL || ""))
  pending.push("E-mail do administrador inicial");
if (pending.length) {
  console.error("Configuração pendente: " + pending.join("; "));
  process.exit(1);
}
console.log(
  "Configuração estrutural pronta. Confirme a política Access de /entrar e Cookie Path Attribute desativado antes do deploy.",
);
