# Referência da API HTTP (`API.md`)

A API do **TrackBus** é implementada em **Hono** ([`apps/api/index.ts`](../apps/api/index.ts)) sobre o runtime Cloudflare Workers. Todas as respostas utilizam JSON (`application/json`) e todas as entradas de mutação são validadas com schemas Zod `.strict()` ([`packages/validation/index.ts`](../packages/validation/index.ts)).

---

## 1. Convenções de Autenticação e Cabeçalhos

- **Cabeçalho de Proteção CSRF**: Todas as requisições `POST`, `PATCH`, `PUT` e `DELETE` originadas pelo navegador devem enviar `x-trackbus: 1` e `Origin` idêntico ao host da aplicação.
- **Modos de Credencial**:
  - **Gestão / Portal Web**: Cookie `tb_demo` (ambiente demonstrativo) ou cabeçalhos Cloudflare Access/Sites (`x-user-id`, `x-user-email`).
  - **Participante Smart Journey (`/participar`)**: Cookie `tb_visitor` (`HttpOnly`, `SameSite=Lax`).
  - **App Android TrackBus Driver**: Cabeçalho `Authorization: Bearer <token>`.

---

## 2. Endpoints de Saúde e Estado Operacional

| Método | Endpoint | Papéis Permitidos | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Público | Verifica conectividade com o banco D1 e retorna `{ ok: true, time }`. |
| `GET` | `/api/state` | `admin`, `driver`, `guardian`, `student` | Retorna o estado operacional consolidado filtrado pelo papel do ator (`routes`, `trips`, `vehicles`, `drivers`, `students`, `incidents`, `notices`, `locations`, `events`, `localCoverage`). |
| `POST` | `/api/demo/Persona` | Qualquer (se `org.demo = true`) | Alterna o perfil ativo da sessão demonstrativa (`role` e opcionalmente `studentId`). |
| `POST` | `/api/demo/reset` | `admin` | Restaura e re-semeia os dados institucionais da demonstração. |
| `POST` | `/api/retention` | `admin` | Remove sessões expiradas (`demo_sessions`, `access_sessions`), assinaturas órfãs (`push_subscriptions`) e janelas antigas de `rate_limits`. |

---

## 3. Endpoints de Cadastros, Rotas e Viagens (Painel Web)

| Método | Endpoint | Papéis Permitidos | Payload (Resumo) | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/vehicles` | `admin` | `{ code, plate, capacity, model, accessibility, status }` | Cria ou atualiza veículo na frota. |
| `POST` | `/api/drivers` | `admin` | `{ name, email, phone, license, status }` | Cria ou atualiza motorista credenciado. |
| `POST` | `/api/students` | `admin` | `{ name, grade, code, routeId, stopId, accessibilityNotes, active }` | Cadastra ou atualiza estudante. |
| `POST` | `/api/users/role` | `admin` | `{ userId, role, active }` | Altera papel (`role`) ou status ativo de um usuário. |
| `POST` | `/api/routes` | `admin` | `{ id?, code, name, shift, color, visibleInJourney, summary, stops[] }` | Cria rota ou gera nova versão imutável em `route_versions` calculando geometria viária (`osm-local` ou `valhalla`). |
| `POST` | `/api/routes/:id/visibility` | `admin` | `{ visibleInJourney: boolean }` | Exibe ou oculta a rota na sala pública Smart Journey (`/participar`). |
| `POST` | `/api/trips` | `admin` | `{ routeId, vehicleId, driverId, serviceDate, shift, trackingMode }` | Agenda nova viagem congelando o snapshot da versão atual da rota. |
| `PATCH` | `/api/trips/:id/status` | `admin`, `driver` (própria viagem) | `{ status, trackingMode?, delayMinutes?, delayReason?, currentStopId?, safeStop? }` | Atualiza estado da viagem (`scheduled`, `active`, `paused`, `interrupted`, `completed`, `cancelled`). |
| `POST` | `/api/trips/:id/confirm` | `admin`, `guardian`, `student` | `{ studentId, status: 'going' \| 'not_going' }` | Confirma se o estudante embarcará na viagem. |

---

## 4. Endpoints de Telemetria GPS, Caminhada, Ocorrências e Avisos

| Método | Endpoint | Papéis Permitidos | Payload (Resumo) | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/gps` | `admin`, `driver` (própria viagem), `Bearer` | `{ tripId, lat, lng, speedKmh?, heading?, accuracyM?, source, recordedAt? }` | Valida a coordenada (`validatePosition`), projeta na polilinha da rota (`project`), calcula ETA para a próxima parada e atualiza `bus_locations`. |
| `POST` | `/api/walking` | `admin`, `driver`, `guardian`, `student` | `{ origin: { lat, lng }, stop: { id, name, lat, lng }, etaMinutes }` | Calcula rota de caminhada do usuário até a parada e retorna `{ distanceMeters, walkingMinutes, leaveInMinutes, status, geometry, source }`. |
| `POST` | `/api/incidents` | `admin`, `driver` | `{ tripId?, routeId?, vehicleId?, severity, category, title, description }` | Registra ocorrência operacional; cria aviso automático e interrompe a viagem se crítica/mecânica. |
| `PATCH` | `/api/incidents/:id` | `admin`, `driver` | `{ status: 'open' \| 'monitoring' \| 'resolved' }` | Atualiza status da ocorrência. |
| `POST` | `/api/notices` | `admin`, `driver` | `{ scope, routeId?, tripId?, severity, title, message }` | Publica comunicado e dispara entregas Web Push para inscritos na rota/viagem. |
| `POST` | `/api/push/subscribe` | Autenticado | `{ endpoint, keys: { p256dh, auth }, routeId?, stopId? }` | Registra assinatura Web Push no portal institucional. |

---

## 5. Endpoints da Smart Journey V3 (`/api/journey/*`)

Estes endpoints atendem a experiência pública controlada em `/participar` e os controles de sala da apresentação:

| Método | Endpoint | Autorização | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/journey/schools` | Público | Lista escolas demonstrativas e informa se a sala pública está aberta (`roomOpen`), total de rotas visíveis e cobertura local OSM (`localCoverage`). |
| `POST` | `/api/journey/join` | Público (se `roomOpen = true`) | Registra participante com `{ displayName, schoolSlug }`, cria sessão `visitor_student` em `access_sessions` e define o cookie `tb_visitor`. |
| `POST` | `/api/journey/leave` | Cookie `tb_visitor` | Revoga a sessão atual do participante e limpa o cookie `tb_visitor`. |
| `GET` | `/api/journey/state` | Cookie `tb_visitor` ou `admin` | Retorna rotas visíveis na jornada, viagens ativas, posições de ônibus com ETAs por parada, avisos entregues e preferência salva do estudante. |
| `POST` | `/api/journey/select` | Cookie `tb_visitor` ou autenticado | Salva a escolha `{ routeId, stopId, tripId? }` em `student_journey_preferences` e sincroniza filtros de Web Push. |
| `POST` | `/api/journey/walk` | Cookie `tb_visitor` ou autenticado | Calcula a caminhada (`pedestrian`) do participante até a parada escolhida usando o grafo local OSM de Salvador (`packages/geodata`) ou fallback institucional. |
| `POST` | `/api/journey/push` | Cookie `tb_visitor` | Registra assinatura Web Push vinculada à sessão do visitante e à parada monitorada. |
| `POST` | `/api/journey/room` | `admin` | Abre ou fecha a sala demonstrativa (`{ roomOpen: boolean }`). Ao fechar, revoga automaticamente todas as sessões `visitor_student` ativas. |
| `POST` | `/api/journey/prepare` | `admin` | Prepara os circuitos oficiais da Congretech na Rua Caetano Moura (`LIN-101` Simulado e `LIN-102` GPS Real) com paradas e viagens prontas para demonstração. |

---

## 6. Endpoints do Aplicativo Android (`TrackBus Driver` — `/api/driver/*`)

| Método | Endpoint | Autorização | Payload | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/driver/pair` | `admin` ou `driver` (Web) | `{ driverId }` | Gera código de pareamento de 6 caracteres válido por **2 minutos** (uso único). |
| `POST` | `/api/driver/exchange` | Público (Rate-limited por IP) | `{ code, deviceLabel }` | Troca o código de 6 dígitos por um token `Bearer` de dispositivo (`driver_device` válido por 14 dias). |
| `GET` | `/api/driver/trips` | `Authorization: Bearer` | — | Retorna dados do motorista pareado, viagens atribuídas a ele, localização atual de cada viagem e ocorrências abertas. |
| `POST` | `/api/driver/trips/:id/status` | `Authorization: Bearer` | `{ status, delayMinutes?, delayReason?, currentStopId?, safeStop? }` | Permite ao app Android iniciar, pausar (`safeStop: true`), retomar, registrar chegada em parada, informar atraso ou encerrar a viagem. |
| `POST` | `/api/driver/trips/:id/wait` | `Authorization: Bearer` | `{ stopId, seconds, safeStop: true }` | Emite ou encerra (`seconds: 0`) espera autorizada de até 5 minutos na parada atual, recalcula ETAs e notifica os alunos. |
| `POST` | `/api/driver/incidents` | `Authorization: Bearer` | `{ tripId, severity, category, title, description, safeStop: true }` | Registra pane mecânica ou ocorrência pela interface simplificada do app Android. |
| `POST` | `/api/driver/revoke` | `Authorization: Bearer` ou `admin` | `{ sessionId? }` | Revoga o token do dispositivo Android imediatamente. |

---

## 7. Códigos de Status HTTP e Formato de Erro

Todas as respostas de erro seguem o padrão `{ "error": "Mensagem clara em português", "details"?: ... }`:

- `200 OK`: Operação realizada com sucesso.
- `400 Bad Request`: Dados inválidos (violação de schema Zod, coordenada fora de alcance ou parada sem confirmação de veículo parado `safeStop`).
- `401 Unauthorized`: Sessão ausente, expirada ou token `Bearer` inválido/revogado.
- `403 Forbidden`: Papel sem permissão para a operação, origem inválida (CSRF) ou sala demonstrativa fechada (`roomOpen = false`).
- `404 Not Found`: Recurso (`trip`, `route`, `driver`, `incident`) inexistente na organização do ator.
- `409 Conflict`: Conflito operacional (ex.: gatilho SQLite detectando dupla alocação de motorista/veículo/rota no mesmo turno ou modo de rastreamento incompatível).
- `429 Too Many Requests`: Limite de taxa excedido na tabela `rate_limits`.
