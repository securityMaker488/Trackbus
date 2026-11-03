# API TrackBus

Prefixo `/api`. Dados JSON. Escritas exigem `Origin` exatamente igual à origem da requisição e `Content-Type: application/json`. A identidade vem do gateway Sites; `orgId` e perfil nunca são aceitos como autoridade no corpo do cliente. Campos desconhecidos são recusados pelos schemas Zod.

| Recurso                        | Método e caminho                                         | Autorização                                         |
| ------------------------------ | -------------------------------------------------------- | --------------------------------------------------- |
| Saúde / identidade             | GET `/health`, `/me`                                     | Saúde pública; identidade autenticada               |
| Inicializar demo               | POST `/bootstrap`                                        | Conta sem vínculo                                   |
| Perfil demo / saída            | POST `/demo/profile`, `/logout`                          | Proprietário da instituição demo                    |
| Estado filtrado                | GET `/state`                                             | Instituição, atribuição e vínculos do ator          |
| Veículos / motoristas / alunos | POST `/{recurso}`, PUT `/{recurso}/:id`                  | Admin                                               |
| Rotas                          | POST `/routes`, PUT `/routes/:id`                        | Admin                                               |
| Versões / vias                 | GET `/routes/:id/versions`, POST `/routes/:id/calculate` | Admin                                               |
| Viagens                        | POST `/trips`                                            | Admin                                               |
| Estado da viagem               | POST `/trips/:id/status`                                 | Admin ou motorista atribuído; cancelamento só admin |
| GPS                            | POST `/trips/:id/location`                               | Motorista atribuído                                 |
| Simulador                      | POST `/trips/:id/simulate`                               | Admin da demo                                       |
| Espera                         | POST `/trips/:id/wait`                                   | Admin ou motorista atribuído                        |
| Avisos / leitura               | POST `/notices`, `/notices/:id/read`                     | Emissão admin/motorista; leitura vinculada          |
| Resolver ocorrência            | POST `/incidents/:id/resolve`                            | Admin/motorista atribuído                           |
| Embarque                       | POST `/boarding`                                         | Admin/monitor atribuído                             |
| Ausência                       | POST `/absences`                                         | Admin/aluno/responsável vinculado                   |
| Manutenção                     | POST `/maintenance`, `/maintenance/:id/complete`         | Admin                                               |
| Despesas / calendário          | POST `/expenses`, `/calendar`                            | Admin                                               |
| Acesso / parentesco            | POST `/memberships`, `/guardians`                        | Admin; verificação explícita de vínculo             |
| Política / limpeza             | POST `/settings`, `/retention`                           | Admin                                               |
| Caminhada                      | POST `/walking`                                          | Aluno/responsável vinculado                         |
| Exportação                     | GET `/reports.csv`                                       | Admin                                               |

Recurso é `vehicles`, `drivers` ou `students`. Contratos exatos: `packages/validation/index.ts`, `packages/shared/types.ts` e validações junto aos handlers em `apps/api/index.ts`.

Exemplo de GPS: `{ "lat": -12.98, "lng": -38.49, "accuracy": 8, "timestamp": 1793720000000, "speed": 7, "heading": 90, "source": "gps" }`. Use o timestamp atual do sensor em milissegundos; velocidade em m/s, precisão em metros, rumo em graus.

Erros retornam `{error, requestId}` quando aplicável. 401 sem login, 403 sem autorização/CSRF, 404 recurso invisível, 409 conflito/transição, 422 validação, 429 quota e 503 dependência indisponível. Quota de 60 escritas/minuto por identidade, payload máximo 64 KiB. GPS deve respeitar intervalo mínimo de quatro segundos; cliente envia no máximo a cada cinco segundos.

O snapshot tem limites explícitos no servidor: até 500 registros por coleção operacional, 200 avisos/eventos/ocorrências e 100 eventos de auditoria recentes. Paginação e consulta histórica completa ainda não estão implementadas. Não usar o snapshot como arquivo histórico integral.
