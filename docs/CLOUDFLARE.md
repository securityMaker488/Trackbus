# Cloudflare próprio — TrackBus V7

Publicado na conta autorizada: https://trackbus-demonstracao.goldensla6.workers.dev. D1 exclusivo `trackbus-demo`, migrações `0000` a `0006` aplicadas. Login administrativo real validado em 14/11/2026, com Access restrito ao proprietário e sessão de seis horas. A aplicação foi inicializada sem rotas; a rota temporária usada no ensaio foi arquivada, preservando histórico.

Evidências: `evidence/cloudflare-published-smoke.json` e `evidence/cloudflare-student-published.json`. Login, cadastro/publicação no D1, aluno independente, escolha/favorito, restrição administrativa, posição simulada, ETA e aviso de atraso passaram. GPS físico e segundo plano Android continuam pendentes de aparelho. APK disponível em `/TrackBus-Driver-v7-arm64.apk`; hash em `V7-ENTREGA.md`.

## Como o acesso funciona

- A página inicial e os arquivos da web são públicos. O aluno entra com nome apenas na instituição demonstrativa aberta, recebe cookie restrito e não acessa a gestão.
- A equipe entra pelo caminho real `/entrar`, protegido por Cloudflare Access. A API valida assinatura RS256, emissor, audience, validade e identidade do JWT; não aceita o header de identidade do Sites nesse modo.
- O motorista usa o APK, uma origem HTTPS e um código de uso único emitido pelo administrador. O token do Driver fica no SecureStore e só opera viagens atribuídas.
- O primeiro administrador precisa ter o e-mail verificado igual a `INITIAL_ADMIN_EMAIL`. Os demais acessos continuam sujeitos a vínculos e RBAC do backend.

O modo antigo `sites` permanece compatível com o gateway privado do Sites. Não o use em um Worker público próprio: ele pressupõe que o gateway tenha autenticado a identidade recebida. A configuração V7 própria fixa `AUTH_PROVIDER=cloudflare-access`.

## Preparar a conta

1. Autentique o Wrangler na conta autorizada: `npx wrangler login`.
2. Crie um D1 exclusivo da demonstração: `npx wrangler d1 create trackbus-demo`. Copie seu UUID para `d1_databases[0].database_id`. Confirme nome e conta antes de aplicar migrações.
3. Escolha uma origem HTTPS do Worker, preferencialmente um domínio próprio na Cloudflare. Configure uma aplicação Access self-hosted para o caminho **`/entrar`**, com política Allow limitada aos e-mails da equipe e autenticação efetiva pelo provedor configurado.
4. Desative **Cookie Path Attribute** nessa aplicação Access: o cookie precisa chegar também a `/api/*`. Mantenha Secure/HttpOnly. Não configure Bypass para a entrada administrativa. Não use `/#/...` como caminho protegido: fragmentos não chegam ao servidor.
5. Preencha `ACCESS_TEAM_DOMAIN` (sem `https://`), `ACCESS_AUD` da aplicação e `INITIAL_ADMIN_EMAIL` em `wrangler.cloudflare.jsonc`. Esses identificadores não são chaves privadas. Configure domínio/rota do Worker conforme a conta.
6. Deixe a página inicial e o transporte da API acessíveis: a autorização de cada recurso é feita no backend. Uma política Access que bloqueie indiscriminadamente toda a origem impediria o aluno e o APK de entrar com suas próprias sessões.

O uso de `ctx.access` não foi adotado porque a documentação informa que o contexto não é propagado a Workers Static Assets. A verificação criptográfica ocorre no Worker, inclusive para o cookie enviado diretamente à API. Fontes: [validação de JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [cookie Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [limitações de ctx.access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#ctxaccess-limitations).

## Validar e publicar, após autorização

Na raiz do projeto:

```sh
npm ci
npm run cloudflare:check
npm run typecheck
npm run lint
npm test
npm run security
npm run build
npx wrangler deploy --dry-run --config wrangler.cloudflare.jsonc
```

O verificador recusa o modelo enquanto faltarem os identificadores reais. Ele não comprova as políticas na conta: confira-as no painel Access. O dry-run não publica.

Preserve o binding `ASSETS`, as regras de módulos e `run_worker_first` limitado a `/api/*` e `/entrar`. Os arquivos JavaScript/CSS precisam ser servidos pelo armazenamento estático; enviar todas essas requisições primeiro ao framework causava 404 e foi corrigido no teste do pacote V7.

Faça backup de eventual banco remoto existente. Somente com a conta, destino e publicação autorizados:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
npm run cloudflare:deploy
```

São necessárias as migrações `0000` até `0006`; a última adiciona `routes.archived_at`. Nenhuma cria rotas de apresentação automaticamente. Após entrar por `/entrar`, o administrador inicial usa **Configurar apresentação**; a escola nasce sem rotas/viagens, com um veículo e um motorista fictícios para facilitar o ensaio.

Não copie o D1 local de testes para produção. Caso uma instalação anterior já tenha exemplos, use **Rotas e paradas → Remover rota**. A ação arquiva, mantém versões/histórico e cancela viagens abertas na demonstração. Instituições fora de demonstração exigem encerrar viagens em execução antes de arquivar.

## Antes do evento

Teste na origem publicada: login Access; acesso administrativo negado sem sessão; aluno só vê rotas publicadas de sua escola; APK pareia e recebe viagem; posição chega a outro celular; encerrar viagem interrompe GPS. Verifique também entrega de arquivos, mapa, HTTPS e instalação da PWA. O ensaio local não substitui essa verificação.

O aluno pode adicionar a web à tela inicial em navegadores compatíveis; a instalação não dispensa internet. A API e dados de localização não são armazenados pelo service worker. [Disponibilidade do fluxo de instalação](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).

Para caminhada fora das áreas locais já cobertas, configure `VALHALLA_URL` institucional HTTPS. Para push, configure VAPID via Secrets; nunca inclua chaves privadas em Git ou APK. Esses serviços opcionais não foram provisionados. Sem eles, o produto mantém a central de avisos e informa quando não consegue calcular caminhada.

## Limitações de segurança a acompanhar

A validação Access foi testada com assinatura em testes, no runtime Workerd e com login real publicado. Uma incompatibilidade `redirect: error` foi corrigida para `manual`, rejeitando respostas de redirecionamento das chaves. Há limites de mutação por identidade persistidos no D1 e limites para entrada/pareamento; para exposição ampla, complemente com controles da conta contra abuso antes de chegar ao Worker. CSP ainda permite `unsafe-inline` para o framework existente; não foi realizado pentest independente. Dados reais de menores ficam fora deste ambiente de demonstração.
