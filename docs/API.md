# API HTTP

Contratos revisados contra `apps/api/index.ts` e `packages/validation/index.ts`; atualização V7 em 11/11/2026. Prefixo `/api`. Respostas JSON; erros retornam `error` e identificador de requisição. `GET /health` retorna serviço/status, sem verificar disponibilidade real do D1.

V7: `GET /auth/config` informa o caminho de login conforme o provedor. `POST /routes/:id/archive` é exclusivo do admin, arquiva a rota da instituição, cancela viagens abertas em demonstração e retira favoritos; preserva histórico. Fora de demo, viagens em operação impedem arquivamento. `POST /guardians` responde 410 ao admin; perfis guardian/monitor são rejeitados no middleware. Bootstrap cria apenas escola, admin, veículo e motorista fictícios, sem rotas. O modo Cloudflare exige JWT Access e e-mail autorizado para bootstrap; detalhes em [Cloudflare](CLOUDFLARE.md).

## Autorização

Identidade institucional vem de JWT Cloudflare Access verificado no modo próprio, ou do gateway Sites em `oai-authenticated-user-id` no modo Sites, com membership ativo no D1. Não enviar esse header de um cliente como mecanismo de login. Visitante usa `tb_visitor`, HttpOnly, SameSite=Strict, Secure em HTTPS, 4h. Android usa Bearer de dispositivo por 8h. Browser exige Origin exato e Content-Type JSON nas escritas. Native sem Origin exige Bearer ou troca de pareamento. Limites e autorização continuam no backend.

| Método     | Caminho                                                       | Contrato / escopo                                                                                                   |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET        | /me, /state                                                   | Identidade / estado filtrado por instituição e papel; visitante não acessa state                                    |
| POST       | /bootstrap                                                    | Identidade Sites sem instituição cria demonstração fictícia                                                         |
| POST       | /demo/profile                                                 | Proprietário da instituição demo troca papel; body {role}                                                           |
| POST / PUT | /vehicles, /vehicles/:id                                      | Admin; name, plate, model, year, capacity, status                                                                   |
| POST / PUT | /drivers, /drivers/:id                                        | Admin; name, contact, userId, status                                                                                |
| POST / PUT | /students, /students/:id                                      | Cadastro administrativo legado; entrada da feira usa journey/join                                                   |
| POST / PUT | /routes, /routes/:id                                          | Admin ou motorista em rascunho próprio; name, description, shift, departureTime, stops, active, expectedVersion                                        |
| POST       | /routes/:id/visibility                                        | Admin; {published:boolean}                                                                                          |
| POST       | /routes/:id/calculate                                         | Admin; recalcula vias com rede local ou Valhalla configurado                                                        |
| GET        | /routes/:id/versions                                          | Admin; versões preservadas                                                                                          |
| POST       | /trips                                                        | Admin; name, routeId, vehicleId, driverId, monitorId opcional, plannedStart/plannedEnd ms, trackingMode             |
| POST       | /trips/:id/status                                             | Admin/motorista atribuído; {status} conforme máquina de estados                                                     |
| POST       | /trips/:id/location                                           | Motorista autorizado/admin; lat, lng, accuracy metros, timestamp ms, speed m/s ou null, heading ou null, source gps |
| POST       | /trips/:id/simulate                                           | Demonstração autorizada; nunca em viagem gps                                                                        |
| POST       | /trips/:id/wait                                               | {stopId,seconds,safeStop:true}; seconds 0 encerra; teto da escola até 300                                           |
| POST       | /notices                                                      | tripId, category, message, delayMinutes, simulated, safeStop para motorista                                         |
| POST       | /notices/:id/read                                             | Confirma leitura após autorização da viagem; inclui visitante                                                       |
| POST       | /incidents/:id/resolve                                        | Admin/motorista atribuído; {resolution}                                                                             |
| POST       | /boarding, /absences                                          | Embarque do monitor/admin; ausência de aluno autorizado/responsável                                                 |
| POST       | /maintenance, /maintenance/:id/complete, /expenses, /calendar | Gestão administrativa                                                                                               |
| POST       | /memberships, /guardians, /settings, /retention               | Gestão autorizada; ver schemas inline                                                                               |
| GET        | /reports.csv                                                  | Admin; CSV com neutralização de fórmulas                                                                            |

## Jornada

`GET /journey/schools` lista apenas id e nome das escolas demo abertas.
`POST /journey/join` recebe {schoolId,name}. Não concede identidade real.
`POST /journey/leave` revoga visitante, preferências, push e leituras da sessão.
`GET /journey/state` exige papel student e retorna catálogo publicado, preferências, viagem selecionada, posição, ETA e avisos.
`POST /journey/select` recebe {routeId,stopId,favorite,notify}.
`POST /journey/walk` recebe {lat,lng}; parada é validada na preferência. A coordenada não é persistida.
`POST /journey/push` recebe {endpoint,enabled}.
`POST /journey/room` exige admin demo; {roomOpen,safetyMargin:1..15}.
`POST /journey/prepare` prepara circuitos fictícios sem apagar histórico.
Portal legado de responsável mantém `POST /walking` com {tripId,studentId,lat,lng}.

## Android

`POST /driver/pair` recebe {driverId}; admin ou próprio motorista web gera código hexadecimal de 16 caracteres, uso único, 2min.
`POST /driver/exchange` recebe somente {code}; retorna {token,expiresIn:28800}.
`GET /driver/trips` lista viagens atribuídas não encerradas e não simuladas.
`GET /driver/incidents` lista ocorrências abertas atribuídas.
`POST /driver/revoke` revoga o Bearer atual. GPS, status, espera e avisos usam os endpoints de viagem da tabela.

400 JSON inválido; 401 credencial inválida; 403 papel/origem; 404 recurso fora do escopo; 409 conflito operacional; 422 validação; 429 limite; 503 serviço indisponível. Não existe endpoint genérico /gps nem /demo/reset.

V6.1: `/journey/state` retorna `progress` da viagem visível; `/driver/trips` inclui progresso apenas nas viagens atribuídas. `/state.locations[].progress` segue autorização da viagem. Campos: alongMeters, totalMeters, observedAt, reliable, offRoute, stopId, stationarySince, anchor e waiting. Estado velho/interrompido nunca retorna waiting atual. Nenhum endpoint aceita progresso fornecido pelo cliente; derivado exclusivamente da posição validada.

## Editor V7.1

- `GET /geo/pois?lat=&lng=&radius=&category=`: admin/motorista; raio de 100..3000 m (UI 1500), até 40 POIs, 30 leituras/min por identidade. category=all ou chave de packages/shared/pois.ts. Retorna pontos, distância do centro, fonte/data, cobertura e truncated; vazio não é erro.
- `POST /routes/preview`: mesmo corpo validado de criação; calcula caminho sem salvar. available=false é um rascunho esquemático, sem ETA inventado.
- `POST /routes/:id/submit {version}`: motorista, apenas rota própria draft/rejected; torna pending e não publicada.
- `POST /routes/:id/review {version,decision,note}`: admin da escola, somente pending; decision approved/rejected; devolução exige justificativa de 5..500 caracteres. Não publica automaticamente.
- `POST /routes/:id/visibility {published}`: admin; publicação exige aprovação.
- `POST /driver/editor-link {}`: Bearer de aparelho ativo; retorna code aleatório de uso único válido por 60s, até 5 emissões/min. App abre o fragmento /#/motorista?codigo=…; o cliente remove o fragmento antes da troca.
- `POST /driver/web-exchange {code}`: Origin exato/JSON; consome código e emite cookie tb_driver HttpOnly/Secure/Strict por até 1h, nunca além da sessão nativa. 10 trocas/min por IP. Não retorna o token nativo.
- `POST /driver/editor-logout {}`: encerra somente o acesso ao editor. Revogar o aparelho também invalida seus editores.

Sessão editor acessa apenas me/state, POIs e edição/envio de rotas próprias; não transmite GPS, não gerencia usuários e não troca papel. expectedVersion impede salvar sobre edição mais recente. Approval/createdBy/published não são aceitos do formulário de criação. Viagens só podem ser programadas sobre rotas aprovadas.
