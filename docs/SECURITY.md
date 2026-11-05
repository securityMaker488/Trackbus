# Segurança da Aplicação (`SECURITY.md`)

O **TrackBus** foi projetado sob o princípio de **Security by Design**, combinando isolamento multi-tenant na camada de dados, sessões criptograficamente assinadas/hasheadas, validação estrita de esquemas, gatilhos no banco de dados e proteção contra falsificação de requisições e SSRF.

---

## 1. Modelo de Ameaças e Superfície de Ataque

O sistema opera em dois contextos simultâneos:
1. **Gestão Escolar Institucional**: coordenadores de transporte, motoristas, estudantes vinculados e responsáveis.
2. **Sala Demonstrativa Pública (FECT / Congretech)**: participantes da feira acessando `/participar` pelo próprio celular via QR Code ou link público.

As principais ameaças mitigadas pela arquitetura incluem:
- **Escalação de privilégio** de participante/visitante da feira para painel administrativo ou perfil de motorista.
- **BOLA / IDOR (Broken Object Level Authorization)** entre organizações ou entre estudantes/motoristas distintos.
- **Poluição de telemetria GPS** (envio de coordenadas simuladas para viagens reais ou vice-versa, ou coordenadas fora de limites físicos).
- **CSRF (Cross-Site Request Forgery)** em mutações autenticadas por cookie.
- **SSRF (Server-Side Request Forgery)** através de endpoints arbitrários de Web Push.
- **Exfiltração de tokens em caso de vazamento de leitura do banco D1**.

---

## 2. Modos de Autenticação e Gestão de Sessão

A resolução de identidade centraliza-se em [`resolveActor`](../apps/api/index.ts) e [`resolveAccessSession`](../apps/api/access.ts), suportando quatro mecanismos isolados:

| Canal | Mecanismo | Armazenamento no Cliente | Armazenamento no D1 | Escopo de Acesso |
| :--- | :--- | :--- | :--- | :--- |
| **Sites / Institucional** | Header `x-user-id` / `x-user-email` | Gerenciado pelo gateway Cloudflare | Tabela `users` | Completo conforme `role` (`admin`, `driver`, `guardian`, `student`) |
| **Sessão Demo Local** | Cookie `tb_demo` | `HttpOnly; SameSite=Lax; Path=/` (`Secure` em HTTPS) | `demo_sessions.id` (SHA-256 do token) | Apenas quando `organizations.demo = 1`; permite alternar perfil de demonstração |
| **Smart Journey (`/participar`)** | Cookie `tb_visitor` | `HttpOnly; SameSite=Lax; Path=/` (`Secure` em HTTPS) | `access_sessions.token_hash` (SHA-256) | Restrito a `/api/journey/*` com `kind = 'visitor_student'`; exige `room_open = 1` |
| **App TrackBus Driver** | Header `Authorization: Bearer <token>` | `Expo SecureStore` (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) | `access_sessions.token_hash` (SHA-256) | Restrito às viagens do `driverId` pareado (`kind = 'driver_device'`) |

### Hashing de Tokens no Banco (Zero Plaintext Tokens)
Nenhum token de sessão ou código de pareamento é salvo em texto puro no banco D1:
- Tokens aleatórios são gerados com `crypto.getRandomValues` (`24 bytes` em base64url via [`randomToken`](../apps/api/access.ts)).
- O banco armazena exclusivamente o digest **SHA-256 hexadecimal** (`sha256Hex`).
- Códigos de pareamento do motorista possuem **6 caracteres alfanuméricos** sem caracteres ambíguos (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), expiram em **2 minutos** (`120_000 ms`) e são de **uso único** (`usedAt` preenchido na troca via `/api/driver/exchange`).

---

## 3. Controle de Acesso Baseado em Papéis (RBAC) e Prevenção de BOLA

- **Isolamento por Organização (`orgId`)**: Todas as consultas e mutações filtram explicitamente por `org_id`. Tentativas de referenciar veículos, motoristas, rotas ou viagens de outra organização retornam `403` ou `404`.
- **Isolamento do Motorista**: Um motorista autenticado (via sessão web ou token Bearer do Android) só pode iniciar, pausar, retomar, encerrar, registrar chegada em parada, emitir espera de 5 minutos ou enviar GPS para viagens cujo `trips.driver_id` corresponda exatamente ao seu registro em `drivers` ([`canDrive`](../apps/api/index.ts)).
- **Isolamento do Participante (`visitor_student`)**:
  - A função [`resolveActor`](../apps/api/index.ts) bloqueia qualquer tentativa de usar o cookie `tb_visitor` em rotas administrativas (`/api/state`, `/api/routes`, `/api/trips`, `/api/users`, etc.).
  - O gateway público opcional ([`worker/event-gateway.ts`](../worker/event-gateway.ts)) encaminha exclusivamente `/participar`, `/api/journey/schools|join|leave|state|select|walk|push` e ativos estáticos públicos, bloqueando na borda qualquer tentativa de acessar `/api/journey/room`, `/api/journey/prepare` ou `/api/driver/*`.

---

## 4. Proteção contra CSRF e Validação de Origem

Mutações HTTP (`POST`, `PATCH`, `PUT`, `DELETE`) passam pelo verificador [`sameOrigin`](../apps/api/index.ts):
- Requisições autenticadas por cabeçalho `Authorization: Bearer` (aplicativo Android nativo) não utilizam cookies de navegador e seguem o fluxo de token de dispositivo.
- Requisições baseadas em navegador exigem que o header `Origin` corresponda exatamente ao `url.origin` do Worker, além do header customizado `x-trackbus: 1` enviado pelo cliente HTTP ([`apps/web/http.ts`](../apps/web/http.ts)) e cookies configurados com `SameSite=Lax` e `HttpOnly`.

---

## 5. Validação Estrita de Entrada e Integridade no SQLite

1. **Schemas Zod `.strict()`**: Todos os payloads em [`packages/validation/index.ts`](../packages/validation/index.ts) utilizam `.strict()`, rejeitando propriedades desconhecidas (prevenção contra *Mass Assignment* e poluição de objetos), além de validar limites geográficos (`lat` entre `-90` e `90`, `lng` entre `-180` e `180`, `speedKmh <= 160`, `accuracyM <= 5000`).
2. **Queries Parametrizadas**: Todo o acesso ao Cloudflare D1 ocorre via Drizzle ORM com parâmetros vinculados (sem concatenação de strings SQL em dados de usuário).
3. **Triggers SQLite de Integridade Operacional** ([`drizzle/0001_guards.sql`](../drizzle/0001_guards.sql)):
   - `trip_schedule_insert` e `trip_schedule_update`: impedem no nível do motor SQLite que uma mesma rota, motorista ou veículo tenha duas viagens ativas/agendadas na mesma data e turno.
   - `trackbus_location_insert` e `trackbus_location_update`: impedem no nível do banco que coordenadas com `source = 'simulation'` sejam gravadas em viagens configuradas com `tracking_mode = 'gps'`, ou que coordenadas `source = 'gps'` sejam gravadas em viagens `tracking_mode = 'simulation'`.

---

## 6. Rate Limiting no Banco D1

O controlador [`hitRate`](../apps/api/index.ts) utiliza a tabela `rate_limits` com `INSERT ... ON CONFLICT DO UPDATE` atômico por janela de tempo:

| Operação | Chave de Limite | Limite Máximo | Janela |
| :--- | :--- | :--- | :--- |
| Telemetria GPS (`/api/gps`) | `gps:<orgId>:<tripId>` | 40 requisições | 60 segundos |
| Pareamento Android (`/api/driver/exchange`) | `driver-exchange:<ip>` | 10 tentativas | 60 segundos |
| Entrada na Sala (`/api/journey/join`) | `journey-join:<orgId>` | 90 entradas | 60 segundos |
| Cálculo de Caminhada (`/api/journey/walk`) | `journey-walk:<sessionId>` | 40 cálculos | 60 segundos |
| Cálculo de Caminhada Portal (`/api/walking`) | `walk:<userId>` | 25 cálculos | 60 segundos |
| Limpeza de Retenção (`/api/retention`) | `retention:<orgId>` | 5 execuções | 60 segundos |

---

## 7. Prevenção de SSRF no Web Push (RFC 8291)

Ao cadastrar uma assinatura Web Push (`/api/push/subscribe` ou `/api/journey/push`), o endpoint de destino fornecido pelo navegador é validado por [`allowedPushEndpoint`](../apps/api/notifications.ts):
- Exige protocolo `https:`.
- Permite exclusivamente os domínios oficiais dos serviços de push dos navegadores:
  - `fcm.googleapis.com`
  - `updates.push.services.mozilla.com`
  - `*.push.apple.com`
  - `*.notify.windows.com`
- Qualquer URL apontando para IPs internos, `localhost` ou domínios arbitrários é rejeitada com `400 Endpoint de notificacao nao permitido`, eliminando vetores de SSRF no Worker.

---

## 8. Privacidade de Localização dos Estudantes

- **Localização do Ônibus**: persistida apenas em estado atual (`bus_locations`, 1 linha por viagem) para exibição aos passageiros autorizados. Não há armazenamento de rastro histórico contínuo.
- **Localização do Estudante**: **nunca é persistida no banco de dados**. Quando o estudante solicita o cálculo de caminhada até a parada (`/api/walking` ou `/api/journey/walk`), suas coordenadas (`origin.lat`, `origin.lng`) são processadas **exclusivamente em memória** para calcular a rota de pedestre no grafo local OSM (`packages/geodata`) ou Valhalla e descartadas imediatamente após a resposta HTTP.
- **Expiração e Retenção**: O endpoint `POST /api/retention` remove sessões demo expiradas (`demo_sessions`), sessões de acesso expiradas (`access_sessions`), assinaturas Web Push vinculadas a sessões expiradas (`push_subscriptions`) e janelas antigas de `rate_limits`.

---

## 9. Verificação Automatizada de Segurança

O script [`scripts/security-check.mjs`](../scripts/security-check.mjs) (`npm run security`) inspeciona estaticamente o repositório em busca de:
- Segredos hardcoded (`PRIVATE_KEY`, `CLOUDFLARE_API_TOKEN`, `SECRET_KEY=`).
- Uso de `dangerouslySetInnerHTML` ou `eval(`.
- Concatenação insegura em chamadas `.raw(`.
- Inclusão acidental de arquivos `.env` no controle de versão.

---

## 10. Limitações Conhecidas e Recomendações para Produção Escolar

1. **Login Demonstrativo Simplificado (`/participar`)**: Projetado especificamente para feiras científicas (FECT / Congretech), permitindo entrada apenas com nome e seleção de escola enquanto `demo = 1` e `room_open = 1`. Em operação escolar real, a flag `room_open` permanece `false` e o acesso dos estudantes/responsáveis deve ocorrer exclusivamente por contas autenticadas vinculadas na tabela `guardian_students`.
2. **Certificado de Assinatura do APK Local**: O script [`apps/driver/build-apk.ps1`](../apps/driver/build-apk.ps1) gera um keystore local protegido por DPAPI do Windows (`work/signing/*.p12` e `*.dpapi`, ignorados pelo Git) para testes e instalação direta na feira. Para distribuição na Google Play Store, recomenda-se utilizar Play App Signing gerenciado em CI/CD seguro.
