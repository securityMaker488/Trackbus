# Web Push e Smart Departure

V11 usa Push API, Service Worker e payload `aes128gcm`/VAPID via `@block65/webcrypto-web-push` 2.0.0. O ensaio em Miniflare executa a criptografia no runtime Workers, sem enviar a terceiros. Entrega física com a página fechada ainda exige Android/iPhone reais.

## Configuração

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK` (JSON da chave P-256 privada) e `VAPID_SUBJECT` (URL HTTPS de contato/aplicação) são segredos do ambiente. Gere um par por instalação, preserve-o e nunca publique o arquivo privado. O script `scripts/generate-vapid.mjs` grava somente em `work/`, sem imprimir as chaves. A chave pública aparece no cliente por necessidade do protocolo. Chave privada fica no Worker. Rotacionar chaves exige novas inscrições.

Configuração preparada para Cron `* * * * *`, sem publicar/ativar no Worker atual nesta etapa. O handler `scheduled` reúne os dados por consulta e processa **até duas estimativas de saída, duas seleções sem caminhada para aproximação e quatro entregas por rodada**, com índice por vencimento e reuso do cálculo por parada. GPS só valida/grava a posição; a fila não cifra/envia no caminho do GPS nem no registro de avisos. Manutenção é alternada para reduzir o trabalho por invocação. Não há consulta Google no Cron nem acompanhamento do GPS do aluno fechado. [Limites e capacidade](PERFORMANCE.md).

## Consentimento, entrega e privacidade

Permissão é pedida apenas ao tocar em Ativar. A interface confirma inscrição válida na sessão/backend, não apenas a existência de uma inscrição antiga no navegador. Preferências separadas para saída, aproximação, avisos e ocultar detalhes na tela bloqueada. Ocultação vem ativada. Sair da sessão visitante remove inscrições e estimativas. No iOS, usar Safari e adicionar à Tela de Início; a aba comum não recebe a promessa de push. Negar permissão mantém a central de avisos funcional.

Endpoints são HTTPS e limitados a serviços push conhecidos; redirects são recusados. Validamos chaves P-256/auth, limite de cinco inscrições por sessão, instituição e vínculo atual à rota/parada. A fila revalida acesso e preferências antes de enviar. 404/410 removem a inscrição; 429/5xx/falha de rede têm até quatro tentativas com espera crescente e validade curta. O identificador de evento/inscrição impede reenfileiramento duplicado; o Service Worker usa tag estável. Uma queda após aceite pelo provedor e antes do registro no banco ainda pode ocasionar repetição: sem garantia de entrega exatamente uma vez. `sent` significa aceite do serviço push, não leitura pelo usuário.

Estimativas contêm somente duração, instante, validade de dez minutos, rota/parada/viagem/volta e fase de alerta. Não armazenam GPS preciso do aluno. Avançam por preparar/sair/margem insuficiente/parada passada e não retrocedem para gerar alertas repetidos. Caminhada vencida gera pedido para atualizar, nunca uma recomendação categórica. Sem ETA confiável, não inventa chegada. O conteúdo antigo do push é substituído por aviso genérico ao chegar após a validade.

Google: consultar a diferença entre duração transitória do provedor e tempo habitual informado pelo aluno em [GOOGLE_MAPS.md](GOOGLE_MAPS.md). O cálculo próprio sobre OSM pode persistir a duração mínima necessária. Histórico pessoal de alertas/fila retido por cerca de um dia; check-ins por 15 minutos. Revogar a permissão no sistema pode impedir qualquer entrega.

## Ensaio obrigatório em aparelhos

Ativar inscrição, selecionar rota/parada, calcular/informar caminhada, iniciar GPS no Driver, fechar a página, gerar atraso e aproximação, confirmar recebimento e abertura da viagem autorizada. Repetir com rede interrompida, preferência desativada, rota trocada, ciclo novo, sessão expirada e chave/endpoint revogado. Android: Chrome atualizado. iPhone: aplicativo instalado pela Tela de Início, após ação explícita. Registrar modelo/SO, horários e resultado; não substituir esse ensaio por mocks.

Referências: [biblioteca Web Crypto](https://github.com/block65/webcrypto-web-push), [Web Push iOS](https://webkit.org/blog/13878/), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292).
