# Testes e Validação da Qualidade (`TESTING.md`)

O **TrackBus** possui uma estratégia de validação em múltiplas camadas cobrindo regras matemáticas de domínio, roteamento sobre grafo OpenStreetMap real, segurança de borda, integração completa de API com Cloudflare D1 (Miniflare), testes End-to-End (Playwright) e auditoria estática de segurança.

---

## 1. Comandos de Execução

| Comando | Ferramenta | Escopo |
| :--- | :--- | :--- |
| `npm.cmd test` | Vitest | Executa todas as 5 suítes de testes unitários e de integração (42 testes). |
| `npm.cmd run test:e2e` | Playwright | Executa os 4 fluxos End-to-End no navegador Chromium contra o Worker compilado. |
| `npm.cmd run typecheck` | TypeScript (`tsc --noEmit`) | Verifica tipagem estática de todo o monorepo (`apps/api`, `apps/web`, `packages/*`, `db/*`, `worker/*`). |
| `npm.cmd run lint` | ESLint 9 | Verifica conformidade de código e hooks React sem alertas. |
| `npm.cmd run security` | `scripts/security-check.mjs` | Auditoria estática contra vazamento de segredos, `.env`, `eval` e SQL injection. |
| `npm.cmd run build` | Vite + Cloudflare Plugin | Valida o empacotamento completo do cliente web e do Worker de produção. |

---

## 2. Resultados Consolidados da Auditoria de Testes

### 2.1 Testes Unitários e de Integração (`Vitest` — 42/42 aprovados)

| Suíte de Teste | Testes | Cenários Validados |
| :--- | :---: | :--- |
| [`tests/unit/domain.test.ts`](../tests/unit/domain.test.ts) | 7 | Projeção linear em polilinha (`project`), cálculo de ETA e paradas visitadas (`estimateArrival`), detecção de sinal desatualizado (`isStale > 60s`), rejeição de coordenadas inválidas ou saltos irreais (`validatePosition`) e recomendação de saída a pé (`walkingRecommendation`). |
| [`tests/unit/geodata.test.ts`](../tests/unit/geodata.test.ts) | 5 | Cobertura do grafo OSM de Salvador (`salvador.json`), roteamento de ônibus e pedestre na Rua Caetano Moura, respeito a mão única e restrições de conversão na Av. Vasco da Gama e rejeição de pontos fora da área. |
| [`tests/unit/routing.test.ts`](../tests/unit/routing.test.ts) | 10 | Priorização do grafo local OSM em Salvador (`osm-local`), chamada externa ao Valhalla quando configurado, fallback institucional quando indisponível, validação de geometrias e cálculo de caminhada com margem de segurança. |
| [`tests/unit/event-gateway.test.ts`](../tests/unit/event-gateway.test.ts) | 10 | Isolamento da borda pública (`worker/event-gateway.ts`): permissão para `/participar` e rotas públicas `/api/journey/*`, bloqueio de `/dashboard`, `/api/state`, `/api/driver/*`, `/api/journey/room` e `/api/journey/prepare`, e exigência de `SITE_SERVICE_TOKEN`. |
| [`tests/integration/api.test.ts`](../tests/integration/api.test.ts) | 10 | Fluxo completo no Cloudflare D1 real (Miniflare) com todas as 4 migrações aplicadas: RBAC por papel, bloqueio de CSRF sem header `Origin`, criação de versões imutáveis de rota, prevenção de conflito de agenda pelos triggers SQLite, separação estrita `gps` vs `simulation`, pareamento Android de uso único, ciclo completo da Smart Journey (`/api/journey/*`), retenção de dados (`/api/retention`) e rejeição de endpoints Web Push não autorizados (anti-SSRF). |

### 2.2 Testes End-to-End (`Playwright` — [`tests/e2e/operations.spec.ts`](../tests/e2e/operations.spec.ts))

1. **Identidade Visual Preta e Amarela + Simulação em Tempo Real**:
   - Verifica na árvore DOM renderizada que nenhum elemento utiliza cores azuis na identidade visual, aciona o simulador e comprova a atualização da telemetria em tempo real.
2. **Jornada do Responsável / Estudante**:
   - Alterna para o perfil de responsável, confirma presença no embarque e executa o cálculo de caminhada até a parada com recomendação de saída.
3. **Sala Pública Smart Journey (`/participar`)**:
   - Acessa `/participar` como estudante visitante na Congretech, entra na sala com nome e escola, seleciona rota e parada, calcula a caminhada local e encerra a sessão.
4. **Pareamento Android + Fluxo Operacional de Espera e Pane Mecânica**:
   - Gera código de pareamento na interface do motorista, troca por token `Bearer`, inicia viagem via API do app Android, emite espera de 5 minutos em parada segura, registra pane mecânica e verifica o recebimento imediato dos avisos na tela do estudante.

---

## 3. Auditoria de Segurança e Dependências

- **`npm run security` ([`scripts/security-check.mjs`](../scripts/security-check.mjs))**:
  - Resultado: `{ "ok": true, "findings": [] }` (0 vulnerabilidades ou segredos expostos).
- **`npm audit` (Raiz e `apps/driver`)**:
  - Raiz do projeto: `found 0 vulnerabilities`.
  - Aplicativo Android (`apps/driver`): `found 0 vulnerabilities`.
- **Verificação do APK Android (`work/android-v3-build.log`)**:
  - Compilação `:app:assembleRelease` concluída com sucesso (`BUILD SUCCESSFUL`).
  - Assinatura verificada via `apksigner verify`: `Verified using v2 scheme (APK Signature Scheme v2): true`.
