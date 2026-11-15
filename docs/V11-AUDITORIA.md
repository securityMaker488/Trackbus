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
