# Implantação e Hospedagem Cloudflare (`DEPLOYMENT.md`)

O **TrackBus** foi projetado para operar integralmente na infraestrutura **Serverless Edge da Cloudflare** (**Cloudflare Workers** + **Cloudflare D1**), mantendo custo zero/mínimo, baixa latência global e ausência de servidores dedicados pesados.

---

## 1. Arquitetura de Implantação

O repositório suporta dois modos complementares de publicação na Cloudflare:

1. **Worker Principal (`trackbus`)**:
   - Ponto de entrada: [`worker/index.ts`](../worker/index.ts) (empacotado via Vite + `@cloudflare/vite-plugin` configurado em [`vite.config.ts`](../vite.config.ts)).
   - Serve os ativos estáticos da SPA React (`dist/client`), o Service Worker (`sw.js`), o manifesto PWA (`manifest.webmanifest`) e toda a API Hono (`/api/*`).
   - Vinculado ao banco de dados **Cloudflare D1** através do binding `DB` (configurado em [`.openai/hosting.json`](../.openai/hosting.json)).
2. **Gateway Público de Eventos Opcional (`trackbus-participantes`)**:
   - Ponto de entrada: [`worker/event-gateway.ts`](../worker/event-gateway.ts), configurado em [`wrangler.event.jsonc`](../wrangler.event.jsonc).
   - Projetado para expor em um domínio público curto (ex.: QR Code da feira) **exclusivamente** a experiência `/participar` e as rotas `/api/journey/schools|join|leave|state|select|walk|push`, autenticando-se contra o Worker principal via Service Token (`SITE_SERVICE_TOKEN`).

---

## 2. Execução e Desenvolvimento Local

### 2.1 Instalação e Preparação do Banco D1 Local
```powershell
# 1. Instalar dependências da raiz
npm.cmd install

# 2. Aplicar as 4 migrações SQLite no estado local do Wrangler/Miniflare
npm.cmd run db:migrate:local

# 3. Iniciar o servidor de desenvolvimento (Vite + Cloudflare Worker + D1 local)
npm.cmd run dev
```

Ao receber a primeira requisição em `/api/state` ou `/api/journey/schools`, a função [`ensureSeeded`](../apps/api/seed.ts) popula automaticamente a organização demonstrativa (`Complexo Escolar TrackBus — Salvador`), usuários, veículos, motoristas, estudantes, rotas, viagens e avisos caso o banco esteja vazio.

### 2.2 Build de Produção e Preview Local
```powershell
# Compilar frontend (dist/client) e bundle do Worker (dist/trackbus)
npm.cmd run build

# Executar o bundle compilado localmente na porta 4173
npm.cmd run preview
```

---

## 3. Variáveis de Ambiente e Bindings

O sistema funciona **100% fora da caixa sem necessidade de chaves externas pagas**, pois conta com o grafo viário OpenStreetMap de Salvador embarcado (`packages/geodata/salvador.json`). Variáveis adicionais podem ser configuradas no ambiente do Worker para recursos opcionais:

| Binding / Variável | Obrigatório? | Descrição |
| :--- | :--- | :--- |
| `DB` | **Sim** | Binding do banco Cloudflare D1 (`D1Database`). |
| `ASSETS` | Automático | Binding de ativos estáticos gerenciado pelo `@cloudflare/vite-plugin`. |
| `VALHALLA_URL` | Opcional | URL de instância Valhalla para cálculo viário fora do polígono local de Salvador. Se omitido, utiliza o motor local `osm-local` em Salvador e fallback institucional fora dele. |
| `VAPID_PUBLIC_KEY` | Opcional | Chave pública VAPID (Base64URL, 65 bytes P-256) para notificações Web Push RFC 8291 nativas. |
| `VAPID_PRIVATE_JWK` | Opcional | JSON da chave privada JWK P-256 correspondente ao par VAPID (armazenar como Secret no Cloudflare). |
| `VAPID_SUBJECT` | Opcional | URI de contato do emissor VAPID (ex.: `mailto:contato@iseetechnologies.com.br`). |

### Variáveis Exclusivas do `wrangler.event.jsonc` (`trackbus-participantes`)
| Variável / Secret | Descrição |
| :--- | :--- |
| `SITE_ORIGIN` | URL base do Worker principal (configurada em `vars` no `wrangler.event.jsonc`). |
| `SITE_SERVICE_TOKEN` | Secret configurado via `npx wrangler secret put SITE_SERVICE_TOKEN --config wrangler.event.jsonc` para autenticar o proxy na origem. |

---

## 4. Aplicação de Migrações no Cloudflare D1 Remoto

As migrações SQL numeradas encontram-se em [`drizzle/`](../drizzle/):
- `drizzle/0000_wet_chat.sql`
- `drizzle/0001_guards.sql`
- `drizzle/0002_smart_journey.sql`
- `drizzle/0003_notice_delivery.sql`

Para aplicar em um banco D1 remoto via Wrangler:
```powershell
npx.cmd wrangler d1 migrations apply trackbus-db --remote
```

---

## 5. Checklist de Segurança Pré-Deploy e GitHub

Antes de qualquer publicação ou atualização de ambiente:
1. Executar `npm.cmd run security` para garantir que nenhum token, chave privada, arquivo `.env` ou certificado `.p12`/`.dpapi` esteja fora das regras do [`.gitignore`](../.gitignore).
2. Executar `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd test` para validar todas as suítes unitárias e de integração.
3. Confirmar que a sala demonstrativa (`/participar`) pode ser aberta e fechada dinamicamente pelo administrador no botão **Sala aberta / Sala fechada** sem necessidade de redeploy.
