# TrackBus — arquitetura e critérios

React/TypeScript estrito e Vite no shell Vinext do Sites. Aplicação em apps/web, API Hono em apps/api, domínio em packages/domain. D1/Drizzle com migrações. Sites publica ambiente privado; autenticação federada do gateway, membership autoriza operações. Sem senhas locais: login/senha independente, recuperação e MFA adicionais ficam pendentes de integração. Sessão demo limitada e vinculada à identidade, nunca utilizável fora da instituição fictícia.

Polling autenticado a cada 5 segundos e invalidação após escritas. Alternativa incremental a Durable Objects/WebSocket, preservando contratos e autorização. GPS no máximo a cada 5 segundos. Sem armazenamento de localização do aluno. Rotas versionadas, itinerário imutável por viagem. Atraso é condição separada do estado e usa deadline substituível. ETA projeta posição na polilinha; sem vias validadas, somente simulação identificada. Valhalla configurável por URL fixa, sem uso de servidores públicos OSRM.

Modelo: organizations → memberships, vehicles, drivers, students, routes, trips. Guardian links, route versions, locations atuais, trip events, notices, incidents, read receipts, boarding, absences, maintenance, expenses, calendar e audit. Todas as tabelas operacionais têm org_id. Itinerário é agregado JSON versionado.

Execução/aceitação: (1) migrar, compilar, autenticar e negar acesso cruzado; (2) CRUD persistente e referências validadas; (3) GPS autorizado, idade/duplicação/anomalia; (4) ETA com faixa e espera limitada; (5) avisos direcionados e resolução; (6) embarque, ausência, calendário, despesas/manutenção; (7) testes de domínio, API, E2E, dependências/segredos; (8) publicação privada e roteiro. Conclusão depende de evidência.
