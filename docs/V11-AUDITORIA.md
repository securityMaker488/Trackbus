# TrackBus V11 — auditoria e continuidade

## Base preservada em 15/11/2026

O repositório existente usa React 19, TypeScript, Vinext/Vite, Hono, Drizzle/D1 e Cloudflare Workers. O Driver usa Expo/React Native. A identidade e o controle institucional por Cloudflare Access foram preservados. Nenhum push para GitHub foi realizado. O remoto consultado permaneceu em `ce6bc1f`; a implementação local anterior estava em `4f68f40`, acrescida do editor V7.1.

Antes do V11, foram concluídos localmente: editor por clique/arraste, desfazer/refazer, origem GPS consentida, rascunho do motorista com aprovação administrativa, controle concorrente de versão, referência opcional de parada, geometria com origem/distância e acesso temporário do Driver ao editor web. Migrações 0007 e 0008 são aditivas. O catálogo OSM local pertence a essa etapa anterior; não será expandido como alternativa ao Places solicitado no V11.

Evidências V7.1: 72 testes unitários/integração aprovados; 8 de 9 E2E aprovados na execução completa e o teste restante aprovado em reexecução após corrigir a busca do registro paginado no próprio teste. TypeScript, ESLint, verificação de segurança, build, dry-run Cloudflare e auditorias npm web/Driver aprovados. Logs locais: `work/editor-release-tests.log`, `work/editor-final-e2e.log`, `work/editor-persistence-retest.log`, `work/editor-final-package.log`, `work/editor-cloudflare-dryrun.log`. APK 7.1.0, código 9, compilado e assinado: SHA-256 `BE98FFE913BA5A3942AB135A50917C81C02531642C32C134390F018C25EC1A85`.

## Diferenças solicitadas no V11

| Área | Estado no início desta etapa |
|---|---|
| Google Maps/Places/Routes | Ausente; MapLibre/OSM funciona e permanece como contingência |
| Ciclos de viagem | Uma execução por viagem; sem ciclos separados |
| Confirmação de espera do aluno | Ausente |
| Web Push | Estrutura parcial: aviso genérico, sem payload cifrado e sem fila durável |
| Smart Departure fechado | Cálculo no navegador; sem monitoramento independente |
| Desenho livre | Editor existente trabalha com paradas e vias; desenho livre ausente |
| GPS nativo | APK compilado; validação física em segundo plano pendente |

Em 15/11/2026 o usuário confirmou que ainda não possui projeto Google Cloud e autorizou preparar a integração **sem ativar cobranças**. Não criar projeto faturado nem habilitar APIs pagas. Testes simulados de contrato não substituem validação real do provedor. Preservar o mapa atual até configuração e ensaio reais.

## Pendências externas

Projeto/chaves restritas, map ID e orçamento Google ainda não disponíveis. Testes em Android físico com tela bloqueada, iPhone instalado e notificações com página fechada dependem dos aparelhos. A versão publicada anterior continua sendo a V7 até novo deploy comprovado. Não considerar o MVP integralmente homologado enquanto essas evidências estiverem pendentes.

## Resultado da fase local — 16/11/2026

O trabalho V7.1 foi preservado no checkpoint `4cdac76`, antes desta implementação. O V11 não foi publicado; Worker, D1, domínio, secrets, Access e faturamento remoto permanecem intactos. Não houve push ao GitHub. As leituras remotas confirmaram que 0007..0012 ainda não estavam aplicadas; 0013 foi criada posteriormente somente no repositório/local.

### Encontrado e preservado

React/Vinext, API Hono, D1/Drizzle, autenticação Cloudflare Access, três perfis, cadastros, viagens, rotas versionadas, mapa MapLibre, geodados anteriores, simulador identificado, progresso/permanência GPS, pareamento Android e logo oficial. Editor por clique/arraste e fluxo motorista → análise → aprovação → publicação foram mantidos e validados novamente.

### Implementado e corrigido

- Google Maps JavaScript/Places New/Routes, pesquisa mundial contextual, POIs, desenho e marcadores por adaptador. Demo Key habilitável apenas em desenvolvimento/avaliação; produção sem chave segue com o mapa existente. Sem ativação de billing ou chamadas reais Google nesta fase.
- Desenho livre limitado/simplificado, desfazer/refazer, ajuste por vias opcional e aviso de traçado esquemático. Corrigidas instruções de modo e alinhamento da opção de ajuste.
- Ciclos com histórico, controle concorrente, qualidade GPS, progresso, retorno à origem e janela operacional. Posição/check-ins antigos não atravessam a volta.
- Check-ins com expiração/cancelamento, uma confirmação por sessão e contagem sem nomes. Favoritar a mesma parada não cancela a confirmação.
- Web Push cifrado por Web Crypto compatível com Workers; fila durável, tentativas, revogação, preferências e proteção de prévia. A biblioteca inicial incompatível com Workers foi substituída antes da entrega.
- Smart Departure no servidor com duração/contexto mínimos, expiração e deduplicação. Aproximação também funciona no código sem caminhada, sem duração inventada. Links de aviso validam viagem/volta/parada; aviso antigo não restaura previsão antiga.
- GPS não distribui notificações. Consultas reunidas, lotes pequenos, manutenção alternada e limpeza Google em SQL reduzem trabalho no Worker. Resposta externa limitada mesmo sem Content-Length.
- Driver V11 compilado e assinado com controles de volta e totais por parada. Páginas de privacidade/condições e roteiros de ensaio preparados.

### Evidências executadas

| Verificação | Resultado |
| --- | --- |
| Vitest, unidade/integração | **88 testes / 16 arquivos aprovados** |
| Playwright E2E | **10/10 aprovados**, Edge local, API e D1 locais reais |
| TypeScript web e Driver | Aprovado |
| ESLint e scanner de segurança limitado | Aprovados, nenhuma ocorrência reportada |
| npm audit completo web e Driver | 0 vulnerabilidades conhecidas reportadas |
| Build web | Concluído |
| Verificador Cloudflare e dry-run | Aprovados, **sem deploy**; gzip do Worker ~1.28 MiB |
| Worker compilado local com autenticação de produção | 19 verificações HTTP/arquivos; identidade forjada recusada; APK conferido por hash |
| Handler agendado compilado | Invocado no runtime local, `outcome: ok` |
| APK Android | 11.0.0/code10, 24.116.912 bytes, arm64, assinatura v2 verificada |
| Dispositivos físicos | Nenhum Android conectado; ensaios físicos não executados |

[Smoke compilado](evidence/v11-compiled-local.json). Logs locais ignorados pelo Git: `work/v11-final-tests.log`, `work/v11-e2e-final.log`, `work/v11-free-types.log`, `work/v11-free-lint.log`, `work/v11-driver-types.log`, `work/v11-final-security.log`, `work/v11-audit-full.json`, `work/v11-driver-audit-full.json`, `work/v11-build-final.log`, `work/v11-cloudflare-dryrun.log`, `work/android-v11-build.log`. Capturas reais: `screenshots/editor-drawing-v11.png`, `editor-desktop.png`, `editor-mobile.png`. Tiles são bloqueados apenas nos E2E, não substituídos por ruas fictícias.

Os testes Google usam respostas de contrato identificadas somente nos testes; o produto não usa coordenadas mock em modo GPS. Criptografia foi executada em Workerd/Miniflare; isso não comprova entrega física. O teste de orçamento verifica lotes/consultas D1, não CPU na borda. A mediana 2,42 ms informada pelo usuário refere-se ao Worker antigo.

### Arquivos, migrações e dependências

Principais módulos: `apps/web/Map.tsx`, `GoogleMap.tsx`, `MapLibre.tsx`, `RouteEditor.tsx`, `DrawOverlay.tsx`, `SmartJourney.tsx`, `PushChoice.tsx`; `apps/api/index.ts`, `journey.ts`, `google-routes.ts`, `geometry-retention.ts`, `cycles.ts`, `push.ts`, `smart-alerts.ts`; `worker/index.ts`; `packages/shared/maps.ts`, domínio/validação; schema, service worker e `apps/driver/App.tsx`/tracking/configuração. Testes novos em `tests/unit` e `tests/integration`, E2E ampliados. Documentação por assunto atualizada.

Migrações locais até **0013**; remoto continua **0000..0006**. 0007/0008 pertencem ao editor preservado; 0009 ciclos/check-ins; 0010 fila/estimativas; 0011 retenção Google; 0012 índices de espera; 0013 agendamento de aproximação. Todas aditivas, sem recriar banco ou copiar fixtures ao remoto.

Dependência de produção nova: `@block65/webcrypto-web-push@2.0.0`. Tipo de desenvolvimento: `@types/google.maps@3.66.10`. Não foi adicionado serviço pago. A versão do pacote Driver foi atualizada para 11.0.0.

### Pendências e riscos explícitos

1. Inserir Demo Key somente em `.dev.vars` e testar Google real: busca/POIs, estilos, gestos, DRIVE/WALK, quota, CSP e falha. [Variáveis/APIs](GOOGLE_MAPS.md). Nenhuma chave foi encontrada/solicitada na conversa.
2. VAPID/Cron estão preparados no código, mas não configurados/publicados no Worker preservado. Validar push com página fechada em Android e iPhone instalado; não prometer entrega.
3. GPS Android com tela bloqueada, reconexão, autonomia e encerramento exigem aparelhos reais. APK V11 exige backend V11 compatível; não foi publicado como substituição do APK público antigo.
4. CPU p95/p99, erros 1102, capacidade da fila e limites D1 precisam de ensaio em ambiente autorizado. Lotes atuais são pequenos para dois celulares; sob carga podem atrasar/expirar notificações. [Limites gratuitos](PERFORMANCE.md).
5. Sem pentest independente ou restauração remota comprovada. Algumas gravações operacionais/eventos não compõem uma única transação. CSP do framework ainda permite inline. Usar somente dados fictícios de pessoas autorizadas.

**O MVP não está integralmente homologado para o evento.** A próxima fase é avaliação Google local com chave, ensaio físico em backend compatível autorizado e medição de recursos antes de qualquer publicação. Não recriar o Worker nem contratar plano para isso.

### Executar e demonstrar

[Execução local](../README.md#execução-local), [deploy futuro somente após autorização](CLOUDFLARE.md), [instalação/pareamento do APK](DRIVER.md), [roteiro FECT 30/11 e 01/12](DEMO.md) e [matriz de ensaio físico](TESTING.md). O arquivo local `.dev.vars` foi preparado vazio, sem chave e ignorado pelo Git; inserir `GOOGLE_MAPS_DEMO_KEY` somente nele e reiniciar o servidor. Não expor o servidor com autenticação simulada por túnel público.
