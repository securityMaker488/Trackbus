# Banco e migrações

V7: aplicar também `0006_archive_routes.sql`, que adiciona `routes.archived_at` nullable. Rotas arquivadas deixam as consultas operacionais e de alunos, mantendo registros/versões/trips para auditoria. O bootstrap novo não cria rotas, viagens ou estudantes. Os exemplos locais foram arquivados por API após backup; a implantação remota mantém seu próprio histórico.

Fonte de verdade: `db/schema.ts` e migrações SQL. D1 com Drizzle e consultas parametrizadas, com dados operacionais isolados por org_id.

| Grupo       | Tabelas                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Identidade  | organizations, memberships, demo_sessions, access_sessions                   |
| Cadastros   | vehicles, drivers, students, guardian_links                                  |
| Operação    | routes, route_versions, trips, locations, trip_events                        |
| Comunicação | notices, read_receipts, incidents, journey_preferences, push_subscriptions   |
| Gestão      | boarding, absences, maintenance, expenses, calendar, audit_logs, rate_limits |

`routes.stops` e `routes.geometry` são JSON tipados. Ordem é a ordem do array; cada parada tem id estável, nome, lat/lng e dwellSeconds. `route_versions.snapshot` e `trips.snapshot` preservam {name,stops,geometry,routed}. Editar rota não altera viagens existentes. `locations` guarda a posição mais recente por viagem, sem histórico preciso do aluno.

`access_sessions.id` é SHA-256 do token/código; kind é visitor, pair, device, handoff ou editor. Não existem users, bus_locations, driver_pair_codes nem notice_deliveries neste schema.

## Evolução

0000 cria o modelo original. 0001 adiciona guardas de agenda. 0002 cria sessões/preferências Smart Journey, visibilidade, modo de rastreamento e guardas de telemetria. 0003 cria push_subscriptions. 0004_v6_route_schedule acrescenta departure_time em routes, vazio para registros existentes. Migrações anteriores permanecem intactas.

Os triggers impedem conflito temporal de veículo/motorista e rejeitam telemetria incompatível com instituição, viagem encerrada ou modo GPS/simulação. `db.batch()` reúne escrita da rota e versão numa transação. Operações com aviso/evento posterior não formam todas uma única transação; esse limite consta em SECURITY.md.

Executar localmente após build: `npm run db:migrate:local`. Testes criam D1 isolado via Miniflare, aplicam todos os SQLs e verificam persistência e restrições. Isso não prova gravação no D1 remoto. Não copiar .wrangler/state para Git nem reaplicar manualmente SQL já registrado.

Migração0005_gps_route_progress acrescenta `locations.progress`, JSON nullable para preservar registros existentes. Contém progresso em metros, instante observado, qualidade, parada e início da permanência. Não armazena posição de aluno nem cria histórico de GPS. Aplicada no D1 local e bancos isolados de testes; implantação remota registrada em CLOUDFLARE.md.

## Editor e aprovação — 14/11/2026

0007 adiciona created_by, approval (draft/pending/approved/rejected), review_note, submitted_at, reviewed_at, created_at e updated_at em routes, com índices de autor/análise. Rotas antigas continuam aprovadas; seu criador legado é o proprietário da instituição e datas desconhecidas ficam em zero. Não são inventadas datas históricas. Uma trigger impede published=true fora de approved. Outra exige que route_versions corresponda à versão atual, tornando atômico o bloqueio de edições concorrentes com envio/revisão.

access_sessions.parent_id vincula handoff/editor ao aparelho, com revogação em cascata e revalidação na leitura. 0008 adiciona distance_meters nullable e geometry_source. Novos cálculos guardam osm-local ou institutional; sem caminho viário, distância fica null e fonte schematic. Registros anteriores permanecem unknown até um cálculo, preservando honestidade da origem.

Cada Stop pode guardar reference {id,name,source:OpenStreetMap}. Origem/destino são primeira/última parada. Dados de POI só entram na rota quando a pessoa confirma a referência. A localização obtida para centralizar o editor não cria histórico; usar como origem salva a parada explicitamente escolhida.

## V11 — migrações 0009 a 0013

- `0009_trip_cycles_checkins`: `trip_cycles`, `student_checkins`, volta/instante de início em trips e volta na posição. Triggers fecham histórico e limpam somente estado efêmero ao mudar/encerrar volta. Guardas rejeitam telemetria antiga; primeira partida permite a leitura inicial obtida até 60s antes de iniciar.
- `0010_smart_push`: chaves/preferências de inscrição; `walk_estimates`, `journey_alerts`, `push_deliveries`, índices e limpeza por volta. Nenhuma tabela recebe coordenadas do aluno. Eventos/inscrições possuem IDs únicos para idempotência; tentativas e lease permitem retomada da fila.
- `0011_google_geometry_expiry`: validade da geometria e índices de expiração em rotas/versões/snapshots. Coordenadas Google são transitórias (24h); expiração mantém paradas e histórico, suspende ETA e substitui por esquema próprio.
- `0012_wait_dispatch_indexes`: índices para esperas vencidas e avisos de encerramento.
- `0013_approaching_schedule`: instante da próxima avaliação de aproximação na preferência e índice; não cria estimativa fictícia de caminhada nem nova tabela de GPS.

Aplicar em ordem, com backup antes do banco remoto. Não copiar dados locais de teste. Place ID Google pode ser salvo com nome genérico `Referência Google`; resultados de Places e duração Google de caminhada não formam catálogo persistente. Dados próprios de paradas/desenhos permanecem.
