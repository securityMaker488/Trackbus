# TrackBus V7 — apresentação prática

Entrega local de 11/11/2026, sobre o projeto existente. Não houve push nem publicação. A versão hospedada anteriormente não recebe estas mudanças até um deploy autorizado.

## O que foi encontrado e preservado

React/TypeScript/Vite/Vinext, Hono/Cloudflare D1/Drizzle, MapLibre, PWA e Expo/React Native. Preservados os cadastros, editor por clique/arraste, versões de rota, seleção livre por escola, favoritos, Smart Journey, ETA por itinerário, caminhada, avisos, simulador, pareamento nativo, transmissão GPS, progresso observado e detecção de permanência após 120 segundos. Calendário, manutenção, despesas, CSV e auditoria continuam no menu secundário.

## Mudanças desta etapa

- Apenas **aluno, motorista e administrador** podem acessar o produto. Backend recusa monitor/responsável; estruturas históricas permanecem no banco para não destruir registros anteriores.
- A apresentação nova começa sem rotas ou viagens. As 12 rotas existentes no D1 **local** foram arquivadas via API autenticada, após backup em `work/pre-v7-demo.sql`. Não foram apagados os registros históricos. Rotas criadas pelos testes também foram arquivadas ao final.
- Painel com três passos: criar rota no mapa, programar viagem, conectar os celulares. Rotas vazias e aluno aguardando publicação têm instruções claras. Ferramentas secundárias ficam recolhidas.
- Logo oficial original preservada, integrada ao fundo por CSS; preto/amarelo com branco e cinza neutro autorizados para leitura. Layout de celular mais compacto e controles de toque maiores.
- Driver: **Iniciar rota com GPS** solicita permissões, inicia a viagem atribuída e ativa a coleta. Se a ativação falhar após o início, apresenta o estado real e permite tentar novamente. O navegador também possui fluxo combinado, sem promessa de coleta com tela bloqueada.
- Configurações simplificadas: link do aluno, seleção do motorista e código temporário com contagem regressiva. Identificador interno do motorista é gerado automaticamente.
- PWA com orientação para adicionar à tela inicial e botão nativo quando o navegador disponibiliza instalação. Não promete funcionamento de GPS em segundo plano na web.
- Cloudflare próprio: modelo de deploy, validação de configuração e autenticação Access com assinatura JWT verificada. O modo Sites anterior continua disponível apenas atrás de seu gateway confiável.

## Arquivos principais

`apps/web/App.tsx`, `SmartJourney.tsx`, `DemoControls.tsx`, `InstallApp.tsx`, `styles.css`, `experience.css`; `apps/api/index.ts`, `seed.ts`, `journey.ts`, `cloudflare-identity.ts`; `apps/driver/App.tsx`, `tracking.ts`, `app.json`; `worker/index.ts`, `worker/event-gateway.ts`; `db/schema.ts`, `drizzle/0006_archive_routes.sql`; `wrangler.cloudflare.jsonc`, `scripts/check-cloudflare.mjs`; testes em `tests/`.

Nenhuma dependência adicionada. Versões instaladas preservadas. Metadados do Driver atualizados para 7.0.0 / versionCode 8.

## Validação e evidências

Resultados consolidados em `docs/evidence/v7-validation.json`; capturas em `docs/screenshots/*-v7.png`. A rotina E2E usa geolocalização controlada explicitamente e tiles externos bloqueados. Esse teste confirma o fluxo e sincronização pelo backend, não comprova recepção de satélite ou coleta nativa em segundo plano.

Passaram 65 testes unitários/integração (9 arquivos), 6 testes E2E, typecheck web/Driver, lint, scanner sem achados e build web. Auditorias npm web/Driver reportaram zero vulnerabilidades. O dry-run Cloudflare terminou sem publicação; o Worker compilado em Wrangler local entregou HTML/JS/CSS, permitiu a entrada restrita do aluno e recusou identidade administrativa forjada. A revisão detectou e corrigiu um 404 de scripts causado pelo roteamento de arquivos estáticos.

O APK Android foi compilado de fato com Gradle `assembleRelease`, assinatura verificada e código do staging comparado com a fonte. Arquivo: `TrackBus-Driver-v7-arm64.apk`, versão 7.0.0 (8), arm64-v8a, Android API 24+, target 36, compile 37. SHA-256: `E1DA3EBDC35B2F3AA34E28DD61603600EEE3AF1A65D9BFD9268EF539A19DB80D`.

Nenhum aparelho apareceu em `adb devices`: GPS real entre celulares, bloqueio de tela, comportamento de bateria e instalação física ainda precisam do ensaio autorizado. Não houve build iOS.

## Executar e preparar os celulares

Na raiz: `npm ci`, `npm run build`, `npm run db:migrate:local`, `npm run dev -- --host 127.0.0.1 --port 5173`. Abra o endereço local e entre no modo de desenvolvimento; esse login simulado não existe no deploy Cloudflare próprio. Para hospedagem e migrações remotas, siga [Cloudflare](CLOUDFLARE.md).

Instale o APK autorizado no Android arm64. Alternativa por USB: `adb install -r TrackBus-Driver-v7-arm64.apk`. No painel publicado, **Configurações → Conectar o motorista** gera o código. No Driver, informe a mesma origem HTTPS e o código antes de expirar. Leia [Driver](DRIVER.md) para permissões, assinatura e compilação.

## Roteiro ao vivo

1. Administrador abre o painel vazio e cria uma rota pelo mapa, definindo origem, paradas, destino e horário.
2. Salva e publica a rota para os alunos. Programa a viagem com motorista, veículo e modo **GPS real**.
3. Abre Configurações, pareia o Driver e compartilha o link do aluno.
4. Motorista, parado em local seguro, seleciona a viagem, confirma segurança e toca **Iniciar rota com GPS**; concede as permissões necessárias.
5. Aluno entra por nome, escolhe rota/parada e autoriza a própria localização para calcular caminhada, quando houver cobertura de roteamento.
6. Participante com Driver caminha em local seguro. Aluno acompanha posição e trecho restante. A posição real não é substituída por simulação.
7. Permanência próxima à parada durante 120 segundos, com leituras válidas contínuas, pode mostrar **esperando**. Isso é distinto da espera autorizada de até cinco minutos.
8. Driver registra atraso de dez minutos, resolve a ocorrência e encerra a viagem. Confirme encerramento do GPS e histórico no painel.
9. Para repetir, programe nova viagem. Remova a rota pelo painel apenas se quiser recriá-la ao vivo. Simulação usa viagem separada e indicação explícita de posição fictícia.

## Pendências reais

Conta/domínio/D1/Access de destino ainda não configurados nem publicados; instalação Android e ensaio físico pendentes; push depende de VAPID e suporte; roteamento caminhável fora da cobertura local depende do serviço configurado. Revisão de dependências e testes automatizados não equivalem a uma certificação de segurança. Riscos e configuração detalhados em [Cloudflare](CLOUDFLARE.md) e [segurança](SECURITY.md).
