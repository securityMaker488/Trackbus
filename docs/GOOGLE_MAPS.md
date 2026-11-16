# Google Maps Platform — configuração V11

Integração preparada; **não habilitada nem homologada com credenciais reais**. O usuário fornecerá a chave no ambiente local. Nenhum projeto faturado, conta ou serviço pago foi ativado por esta atualização. Até a configuração e validação, MapLibre/OpenStreetMap continua operacional.

## Avaliação gratuita com Demo Key — 16/11/2026

A documentação atual do Google permite uma Demo Key sem vincular faturamento para avaliação/testes, incluindo Maps JavaScript, Places New e Compute Routes. As quotas podem mudar e o serviço pausa quando elas acabam. Não usar em produção, não vincular cartão nem fazer upgrade. A aceitação dos termos e emissão da chave cabem ao titular. [Documentação oficial](https://developers.google.com/maps/documentation/javascript/demo-key) · [Termos do Demo Project](https://cloud.google.com/terms/maps-platform/demo-project-terms).

No arquivo **`.dev.vars` da raiz**, ignorado pelo Git:

```dotenv
APP_ENV=development
MAP_PROVIDER=google
GOOGLE_MAPS_MODE=demo
GOOGLE_MAPS_DEMO_KEY=preencher_apenas_no_arquivo_local
GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

Usar a chave emitida pelo Google, não o texto de exemplo. Reiniciar o servidor local depois de alterar. Para um ambiente de avaliação separado e autorizado, `APP_ENV=evaluation`; isso não autoriza publicar o Worker existente. Em `production` ou sem `APP_ENV`, a Demo Key é bloqueada pelo adaptador; o verificador de publicação também recusa modo demo na configuração do Worker atual. A tela identifica o modo de avaliação.

Nesse modo, `GOOGLE_MAPS_DEMO_KEY` serve ao SDK e a Compute Routes dentro dos recursos permitidos. Nenhum segredo é enviado ao GitHub. A chave do SDK precisa chegar ao navegador e, portanto, não pode ser ocultada de quem usa a avaliação. Não colocar uma chave privada de produção nesta variável. Sem a chave local, somente os testes de contrato podem ser executados; não há substituto fictício no produto.

`DEMO_MAP_ID` é um identificador de mapa de teste, **não é uma API Key**. Pode ser usado sem criar estilo faturado próprio. Estilo, compatibilidade do autocomplete/POIs e quotas reais precisam ser conferidos com a Demo Key fornecida.

## APIs necessárias

1. **Maps JavaScript API**: mapa, Advanced Markers e biblioteca `marker`.
2. **Places API (New)**: autocomplete mundial, detalhes selecionados e busca próxima. Não usar Places Legacy.
3. **Routes API**: `directions/v2:computeRoutes` para condução e caminhada.

Não é necessária uma Geolocation API: o GPS vem do consentimento ao navegador/aparelho. Geometry/Drawing Legacy não são usados. O desenho livre usa Pointer Events e coordenadas do mapa; não adiciona um serviço pago.

## Variáveis

| Variável | Uso |
|---|---|
| `MAP_PROVIDER` | `maplibre` inicialmente; `google` após configurar o ambiente permitido |
| `APP_ENV` / `GOOGLE_MAPS_MODE` | `development` ou `evaluation` + `demo` permitem Demo Key; produção não permite |
| `GOOGLE_MAPS_DEMO_KEY` | Chave de avaliação fornecida localmente, nunca usada no Worker de produção |
| `GOOGLE_MAPS_BROWSER_KEY` | Chave restrita por HTTP referrer e somente Maps JavaScript API + Places API (New) |
| `GOOGLE_MAPS_MAP_ID` | Map ID JavaScript próprio, associado ao estilo escuro da instituição |
| `GOOGLE_ROUTES_KEY` | Chave separada, restrita à Routes API, armazenada somente no Worker |

As variáveis `GOOGLE_MAPS_BROWSER_KEY` e `GOOGLE_ROUTES_KEY` descrevem a integração padrão futura, que **não será ativada sob a instrução atual de manter somente serviços gratuitos sem faturamento**. Guarde valores reais em `.dev.vars` local, ignorado pelo Git, ou no gerenciador de segredos. Não cole chaves em código, documentos, capturas, GitHub ou mensagens. Não adicionar prefixo `VITE_` à chave de servidor. A chave de navegador é necessariamente visível ao navegador: sua proteção é a restrição de origem/API/quota. A chave Routes separada nunca aparece em `/api/maps/config`.

O modo `google` só é selecionado se também houver chave de navegador e map ID. Sem isso, nenhuma chamada Google é disparada. Sem a chave Routes, o editor permite salvar um rascunho explicitamente esquemático.

Origens permitidas da chave de navegador: `https://trackbus-demonstracao.goldensla6.workers.dev/*` e uma chave de desenvolvimento separada para a origem local. Não use curingas globais. A egress IP de Workers não é fixa por padrão; não inventar uma restrição de IP que quebrará a Routes API. Restrinja API, escopo do projeto e quota, mantenha o segredo no Worker e revise o mecanismo de autenticação aceito pelo Google ao ativar.

Para o ambiente Cloudflare, configurar os valores pelo painel de Secrets/Variables ou via `wrangler secret put NOME --config wrangler.cloudflare.jsonc` com entrada interativa. Definir `MAP_PROVIDER=google` e o map ID somente após configuração do titular. Os comandos não foram executados para o Google nesta etapa. `MAP_PROVIDER=maplibre` reverte o mapa sem apagar rotas.

## Implementação e consumo

`apps/web/Map.tsx` escolhe o adaptador; `GoogleMap.tsx` carrega o SDK uma vez com versão trimestral. Autocomplete tem viés de região/contexto, não limitação a uma lista de municípios. Consultas Nearby são acionadas pelo usuário, limitadas a 15 resultados em 1,5 km; campos solicitados são ID, nome, categoria e posição. Marcadores e nomes são transitórios, sem catálogo copiado para o banco. Somente o Place ID pode ser associado à parada, com rótulo genérico; o operador confirma a posição na via.

Routes usa URL fixa HTTPS, timeout, redirect manual recusado, máscara de campos e validação da resposta. Cálculos de ônibus são acionados em salvar/preview/recalcular, com limite institucional de 20 solicitações de cálculo por minuto. O adaptador aceita até 25 pontos por chamada. A caminhada é solicitada pelo usuário; não há consultas Google a cada pacote GPS ou por aluno no Cron. ETA do ônibus usa geometria válida e GPS observado no domínio existente. DRIVE não certifica restrições de altura/peso nem acesso de ônibus.

## Retenção e atribuição

Dados originais de rota/parada/desenho são da instituição. Coordenadas calculadas pelo Google têm validade de **24 horas**, inferior ao teto de 30 dias documentado para coordenadas. O Cron remove a geometria temporária de rotas, versões e snapshots de viagens; preserva paradas e histórico operacional. Ao expirar, a aplicação suspende o ETA sobre aquela geometria e solicita recálculo. Distância e duração retornadas pelo Google não são gravadas nos registros permanentes.

A duração Google da caminhada fica na tela. Para Smart Departure com página fechada nesse modo, o aluno informa separadamente seu tempo habitual; o resultado de duração do provedor não é copiado para a tabela de estimativas. Com a rede OSM local, a duração calculada pelo próprio serviço pode alimentar automaticamente a estimativa de 10 minutos. Essa diferença é apresentada ao usuário, sem simular continuidade de GPS.

Conteúdo Routes não é desenhado no mapa OpenStreetMap de contingência. A interface usa apenas as paradas próprias e indica traçado esquemático nessa situação. Não ocultar a atribuição, logo Google, termos ou controles legais do SDK. Vincular estilo escuro ao Map ID; a validação visual final exige acesso real ao projeto. Publicar os links de termos e privacidade antes de ativar.

## Validação pendente do titular

Após disponibilizar as variáveis, testar mapa real, busca por `Campina`, nomes com acentos, local fora da Paraíba, POIs, clique/arraste/toque, desenho, rota DRIVE, percurso WALK, chave bloqueada, quota e erro de rede. Conferir CSP, atribuições, cobrança por SKU e limites no projeto Google. Testes de contrato em `tests/integration/google-routes.test.ts` usam respostas simuladas explicitamente e não comprovam funcionamento do serviço externo.

Fontes oficiais consultadas em 15/11/2026: [carregamento do SDK](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [Places Autocomplete New](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new), [Nearby Search](https://developers.google.com/maps/documentation/javascript/nearby-search), [Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions), [políticas de armazenamento e atribuição](https://developers.google.com/maps/documentation/routes/policies), [CSP](https://developers.google.com/maps/documentation/javascript/content-security-policy). Revisar o contrato aplicável à conta antes da ativação; a preparação técnica não substitui aceite do titular.
