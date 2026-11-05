# Funcionalidades Implementadas e Planejadas — TrackBus

Este documento cataloga de forma transparente todas as funcionalidades **efetivamente implementadas e verificadas** no código atual do TrackBus, bem como as funcionalidades **planejadas para fases futuras** (pós-feira).

---

## 1. Funcionalidades Implementadas

### 1.1. Gestão Institucional e Cadastros (`apps/api`, `apps/web`)
- **Bootstrap de Demonstração (`/api/bootstrap`)**: Criação automática de instituição isolada (*Colégio Horizonte*) com dados fictícios completos (4 veículos, 3 motoristas, 3 rotas com 4 paradas cada, 8 alunos, 1 vínculo de responsável, 3 viagens, posições simuladas, avisos, manutenção e auditoria).
- **Gestão de Frota (`/vehicles`)**: Criação e edição de veículos com validação de placa Mercosul/antiga (`^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$`), capacidade (1–100 lugares), ano e status (`available`, `maintenance`, `inactive`). Impede indisponibilizar veículo com viagem pendente.
- **Gestão de Motoristas (`/drivers`)**: Cadastro e edição de motoristas com vínculo opcional de identidade (`userId`), contato e bloqueio de inativação quando há viagens pendentes.
- **Gestão de Alunos e Responsáveis (`/students`, `/guardians`)**: Cadastro de alunos vinculados a uma rota e parada válidas da instituição; vínculo administrativo de responsáveis com confirmação explícita de verificação legal (`verified: true`).
- **Vínculos de Acesso (`/memberships`)**: Atribuição de perfis (`admin`, `driver`, `student`, `guardian`, `monitor`) por identificador de usuário.
- **Política da Instituição (`/settings`, `/retention`)**: Configuração do nome institucional, tempo máximo de espera em paradas (`0` a `300` segundos) e limpeza sob demanda de sessões e quotas expiradas (`demo_sessions`, `access_sessions`, `push_subscriptions` e `rate_limits`).

### 1.2. Rotas, Paradas e Malha Viária (`packages/geodata`, `apps/api/routing.ts`)
- **Editor Visual de Rotas (`/routes`)**: Criação, edição e duplicação de rotas com adição de paradas por clique no mapa ou coordenadas manuais, reordenação de paradas e tempo de permanência (`dwellSeconds`).
- **Versionamento Imutável (`route_versions`)**: Cada edição ou cálculo viário gera uma nova versão numerada (`v1`, `v2`, ...) em `route_versions`. Viagens já programadas preservam seu `snapshot` original.
- **Proteção de Alunos Vinculados**: O servidor recusa a remoção de uma parada que possua alunos vinculados (`409 Conflict`) até que os alunos sejam reatribuídos.
- **Publicação para o Catálogo de Alunos (`/routes/:id/visibility`)**: Controle administrativo para publicar ou ocultar rotas no catálogo do Smart Journey.
- **Cálculo de Trajeto sobre Vias Reais (`/routes/:id/calculate`)**: Calcula a geometria real da rota pelo motor A* local de Salvador (`packages/geodata`) ou via servidor Valhalla HTTPS externo (`VALHALLA_URL`).

### 1.3. Viagens, Escala e Operação (`packages/domain`, `apps/api`)
- **Programação com Prevenção de Conflitos (`/trips`)**: Valida disponibilidade de rota/veículo/motorista, capacidade do veículo frente aos alunos ativos da rota, calendário letivo (bloqueia datas suspensas) e impede sobreposição de horário para o mesmo veículo ou motorista (via triggers SQLite `trip_schedule_insert` e `trip_schedule_update`).
- **Máquina de Estados com Controle de Concorrência (`/trips/:id/status`)**: Transições validadas no domínio e atualizadas com revisão otimista (`revision = revision + 1`), evitando condições de corrida entre dispositivos.
- **Trava de Veículo Parado em Segurança (`safeStop`)**: Controles operacionais do motorista (web e app Android) exigem confirmação explícita de parada segura e verificam se o GPS não indica movimento (`speed > 1.5 m/s` nos últimos 30 segundos).
- **Espera Autorizada na Parada (`/trips/:id/wait`)**: Permite iniciar espera de até `maxWait` segundos quando o ônibus está próximo (`<= 150 m`) e parado na parada selecionada, sem permitir renovação repetida na mesma parada. A expiração é reconciliada transacionalmente na leitura (`expireWaits`), gerando evento e aviso únicos.

### 1.4. Rastreamento GPS e Simulador (`apps/api`, `apps/web/Map.tsx`)
- **Isolamento Estrito entre GPS e Simulação**: Coluna `tracking_mode` (`gps` | `simulation` | `unassigned`) e triggers `trackbus_location_insert` / `trackbus_location_update` garantem que viagens de GPS real nunca recebam dados do simulador e vice-versa.
- **Validação de Telemetria GPS (`/trips/:id/location`)**: Verifica coordenadas, janela de tempo (`-60s` a `+10s`), precisão (`<= 100m`), intervalo mínimo (`>= 4s`), ausência de duplicação e velocidade máxima plausível, além de estimar velocidade por deslocamento quando o sensor reporta `speed: null`.
- **Simulador de Percurso Demonstrativo (`/trips/:id/simulate`)**: Avança a posição ao longo da polilinha da rota com velocidades configuráveis (7 a 72 km/h), restrito a instituições demonstrativas (`demo: true`) e explicitamente identificado na interface como `SIMULAÇÃO — POSIÇÃO FICTÍCIA`.

### 1.5. Smart Journey e Portal do Aluno / Responsável (`apps/web/SmartJourney.tsx`)
- **Login Demonstrativo Simplificado (`/participar`, `/api/journey/join`)**: Permite que visitantes e alunos na FECT/Congretech entrem apenas com nome/apelido e escola demonstrativa quando a sala está aberta (`roomOpen: true`), recebendo um cookie `tb_visitor` restrito exclusivamente às rotas de leitura e preferência da jornada.
- **Preparação Automática para a Feira (`/api/journey/prepare`)**: Cria de forma idempotente os circuitos `Circuito Congretech · GPS real` e `Circuito Congretech · Simulação` sobre a Rua Caetano Moura em Salvador.
- **Seleção de Rota, Parada e Favoritos (`/api/journey/select`)**: Filtros por nome e turno, marcação de rota favorita e preferência de alertas na tela.
- **ETA por Projeção Linear (`estimateArrival`)**: Calcula distância restante ao longo do traçado, soma tempos de parada intermediários (`dwellSeconds`) e esperas/atrasos vigentes, exibindo faixa de chegada (`minMinutes`–`maxMinutes`) e recusando previsões reais para traçados meramente esquemáticos (`routed: false`).
- **Caminhada até a Parada e Recomendação de Saída (`/api/journey/walk`, `/api/walking`)**: Calcula o trajeto a pé pela malha viária local de Salvador sem armazenar a localização do aluno no banco, exibindo a linha pontilhada no mapa e recomendando o momento de saída (`on_time`, `leave_now`, `insufficient`).
- **Portal do Responsável (`Portal` em `apps/web/App.tsx`)**: Acompanhamento dos dependentes vinculados (com seletor quando há múltiplos filhos), visualização de ETA, caminhada até a parada e registro/cancelamento de ausências programadas (`/absences`).

### 1.6. Avisos, Ocorrências, Embarque e Gestão Financeira
- **Avisos Direcionados e Confirmação de Leitura (`/notices`, `/notices/:id/read`)**: Categorias operacionais (`delay`, `mechanical`, `traffic`, `interruption`, `resumed`, `information`, `assistance`, `early`), contador de não lidos e confirmação individual de leitura.
- **Notificações Web Push VAPID (`/api/journey/push`)**: Inscrição opcional no navegador e envio de sinalização Web Push assinada com ECDSA P-256 (VAPID) sem expor dados pessoais no payload.
- **Gestão de Ocorrências (`/incidents/:id/resolve`)**: Avisos de `mechanical`, `interruption` ou `assistance` interrompem automaticamente a viagem e abrem uma ocorrência; a viagem só pode ser retomada após o encerramento da ocorrência.
- **Controle de Embarque e Desembarque (`/boarding`)**: Registro manual pelo monitor ou administrador, exigindo embarque prévio antes do desembarque e impedindo duplicidade na mesma viagem (`boarding_once`).
- **Manutenção, Despesas, Calendário, Relatórios e Auditoria**: Fluxo completo de abertura/conclusão de manutenção (alterando status do veículo), lançamento de despesas em centavos, calendário com suspensão de transporte, gráficos Recharts, exportação CSV protegida contra CSV Injection e log de auditoria.

### 1.7. Aplicativo Android `TrackBus Driver` (`apps/driver`)
- **Pareamento Seguro de Uso Único (`/api/driver/pair`, `/api/driver/exchange`)**: Código alfanumérico de 16 caracteres válido por 2 minutos, trocado por token de dispositivo (`device`) com validade de 8 horas armazenado no `Expo SecureStore`.
- **GPS em Segundo Plano com Foreground Service**: Rastreamento contínuo via `expo-location` e `expo-task-manager` com notificação persistente no Android, filtro de precisão, fila local para reenvio da última posição em quedas momentâneas de rede e encerramento automático ao concluir a viagem.

---

## 2. Funcionalidades Planejadas (Próximas Fases / Produção)

As funcionalidades abaixo **não fazem parte do escopo concluído para a feira** e estão documentadas como evolução planejada para eventual homologação em produção:

1. **Autenticação Institucional Independente**: Login próprio com e-mail/senha ou SSO institucional (SAML/OIDC), recuperação de conta e autenticação multifator (MFA) independente do gateway privado do ambiente de demonstração.
2. **Provedor Geográfico Dedicado em Nuvem**: Implantação de instância Valhalla dedicada com malha viária estadual/nacional completa e SLA para operação fora do recorte demonstrativo de Salvador.
3. **WebSockets / Cloudflare Durable Objects**: Substituição ou complementação do polling de 5 segundos por conexões persistentes para frotas de grande porte.
4. **Escalas Recorrentes e Substituição em Viagem**: Geração automática de viagens semanais a partir de grades de horário e fluxo de substituição de veículo/motorista durante uma viagem interrompida por pane.
5. **Correção Auditável de Embarque**: Fluxo administrativo de estorno/retificação de embarque ou desembarque registrado por engano pelo monitor, mantendo histórico imutável.
6. **Paginação Server-Side e Arquivo Histórico**: Cursores de paginação na API para consulta de histórico de viagens, eventos e auditoria além dos limites atuais do snapshot operacional (500 registros).
7. **Política Automatizada de Retenção e Exportação LGPD**: Cron Triggers para expurgo automático periódico de logs antigos e portal de exportação/exclusão de dados titulares.
