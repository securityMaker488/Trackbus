# Execução e implantação

A implantação atual está publicada no Cloudflare próprio; não houve push ao GitHub. Para hospedar diretamente na Cloudflare com autenticação Access, use [o guia V7](CLOUDFLARE.md). A configuração .openai/hosting.json e o Site existente foram preservados. O banco local é separado do D1 hospedado.

## Local

Node >=22.13, npm, Git. Na raiz:

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev -- --host 127.0.0.1 --port 5173
```

Abrir http://127.0.0.1:5173. Login simulado existe somente no ambiente de desenvolvimento. Configurar apresentação chama /api/bootstrap e prepara uma escola sem rotas; não há seed automático em GET. Crie/publique a rota, programe a viagem e conecte os celulares em Configurações. Participantes usam /#/participar em outro contexto de navegador.

`npm start` serve o Worker compilado via Wrangler local; não existe npm run preview. A configuração gerada está em dist/server/wrangler.json. Bundle do Worker em dist/server/index.js, cliente em dist/client.

## Cloudflare via Sites existente

Fluxo suportado do projeto: compilar/testar, enviar exatamente o commit autorizado à origem configurada no Sites, empacotar artefato e publicar versão no mesmo project_id. O Git origin atual aponta ao GitHub securityMaker488/Trackbus; não substituí-lo automaticamente. Publicação depende de autorização explícita do proprietário neste pedido V6. Preservar audiência privada atual.

DB é binding obrigatório. VALHALLA_URL é opcional, HTTPS fixo de provedor institucional; não há servidor público de roteamento embutido. VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK e VAPID_SUBJECT habilitam push; chave privada como Secret. Nunca colocar valores privados em .openai/hosting.json, app Android ou Git.

Migrações 0000..0008 precisam acompanhar a versão. Nunca aplicar alterações remotas por suposição. No ambiente Cloudflare próprio, depois de criar/configurar o D1 e a fronteira de identidade:

```sh
npx wrangler d1 migrations apply DB --remote --config <configuração-aprovada>
npx wrangler deploy --config <configuração-aprovada>
```

A configuração deve apontar migrations_dir para drizzle, DB para o banco correto, bundle gerado e assets. Não usar IDs locais placeholder no remoto. O Worker principal ainda requer gateway de identidade confiável; detalhes em SECURITY.md.

## Acesso dos dois aparelhos

Site privado exige login do gateway antes da entrada simplificada; o Android não reutiliza automaticamente essa sessão. A opção preparada é worker/event-gateway.ts, configuração wrangler.event.jsonc, com SITE_ORIGIN e secret SITE_SERVICE_TOKEN. Permite jornada e comandos de motorista autenticados, bloqueia administração e não inclui segredo no cliente.
Após autorização e configuração de conta/domínio:

```sh
npx wrangler secret put SITE_SERVICE_TOKEN --config wrangler.event.jsonc
npx wrangler deploy --config wrangler.event.jsonc
```

Esse gateway não foi publicado nem validado entre aparelhos reais. Não há garantia de custo zero: conferir limites e preços do plano escolhido antes do evento. Nenhum serviço pago foi criado nesta etapa.
