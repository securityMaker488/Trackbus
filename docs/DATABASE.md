# Banco e migrações

V7: aplicar também `0006_archive_routes.sql`, que adiciona `routes.archived_at` nullable. Rotas arquivadas deixam as consultas operacionais e de alunos, mantendo registros/versões/trips para auditoria. O bootstrap novo não cria rotas, viagens ou estudantes. Os exemplos locais foram arquivados por API após backup; o D1 remoto não foi alterado.

Fonte de verdade: `db/schema.ts`. D1 com Drizzle e consultas parametrizadas. São 25 tabelas, com dados operacionais isolados por org_id.

| Grupo       | Tabelas                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Identidade  | organizations, memberships, demo_sessions, access_sessions                   |
| Cadastros   | vehicles, drivers, students, guardian_links                                  |
| Operação    | routes, route_versions, trips, locations, trip_events                        |
| Comunicação | notices, read_receipts, incidents, journey_preferences, push_subscriptions   |
| Gestão      | boarding, absences, maintenance, expenses, calendar, audit_logs, rate_limits |

`routes.stops` e `routes.geometry` são JSON tipados. Ordem é a ordem do array; cada parada tem id estável, nome, lat/lng e dwellSeconds. `route_versions.snapshot` e `trips.snapshot` preservam {name,stops,geometry,routed}. Editar rota não altera viagens existentes. `locations` guarda a posição mais recente por viagem, sem histórico preciso do aluno.

`access_sessions.id` é SHA-256 do token/código; kind é visitor, pair ou device. Não existem users, bus_locations, driver_pair_codes nem notice_deliveries neste schema.

## Evolução

0000 cria o modelo original. 0001 adiciona guardas de agenda. 0002 cria sessões/preferências Smart Journey, visibilidade, modo de rastreamento e guardas de telemetria. 0003 cria push_subscriptions. 0004_v6_route_schedule acrescenta departure_time em routes, vazio para registros existentes. Migrações anteriores permanecem intactas.

Os triggers impedem conflito temporal de veículo/motorista e rejeitam telemetria incompatível com instituição, viagem encerrada ou modo GPS/simulação. `db.batch()` reúne escrita da rota e versão numa transação. Operações com aviso/evento posterior não formam todas uma única transação; esse limite consta em SECURITY.md.

Executar localmente após build: `npm run db:migrate:local`. Testes criam D1 isolado via Miniflare, aplicam todos os SQLs e verificam persistência e restrições. Isso não prova gravação no D1 remoto. Não copiar .wrangler/state para Git nem reaplicar manualmente SQL já registrado.

Migração0005_gps_route_progress acrescenta `locations.progress`, JSON nullable para preservar registros existentes. Contém progresso em metros, instante observado, qualidade, parada e início da permanência. Não armazena posição de aluno nem cria histórico de GPS. Aplicada no D1 local e bancos isolados de testes; migração remota pendente.
