# Funcionalidades e histórico de auditoria

## V11 local — 16/11/2026

Desenho livre integrado ao editor preservado; Google Maps/Places/Routes preparado com Demo Key apenas em avaliação; ciclos com guardas de percurso e horário; check-ins anônimos por parada; fila push cifrada e revogável; processamento de saída e aproximação em lotes pequenos. APK 11.0.0 assinado. Google real, GPS físico e entrega push fechada ainda não homologados. Produção não atualizada por instrução do titular. Evidências atuais em [V11-AUDITORIA.md](V11-AUDITORIA.md), [TESTING.md](TESTING.md) e [PERFORMANCE.md](PERFORMANCE.md). Os tópicos seguintes são históricos.

## Atualização V7.1 — 14/11/2026

Editor por clique/touch com exploração segura, nomes automáticos, desfazer/refazer, confirmação de limpeza, ordem, prévia e persistência. Localização consentida com precisão e opção de origem. Catálogo OSM de 4.707 referências da Paraíba servido por proximidade; nomes sugeridos e confirmados. Motorista cria/envia rascunhos, admin aprova/devolve/publica; isolamento e versão são validados na API/D1. Driver 7.1 compilado, com entrada temporária no editor.

Cloudflare próprio publicado com Access real validado, D1 e sessões independentes de aluno. Resultados atuais em TESTING.md/CLOUDFLARE.md. Persistem limitações de GPS físico, cobertura de roteamento fora dos recortes e push sem VAPID. Os estados abaixo registram a auditoria anterior, não substituem esta atualização.

## Histórico V6

Auditoria iniciada em 9/11/2026 sobre main ce6bc1f. GitHub e checkout apontavam ao mesmo commit, sem mudanças pendentes. Histórico de merge com a documentação do GitHub preservado. Backup Git bundle e branch recovery/pre-v6-20261109 criados antes das alterações.

| Recurso                                                                | Estado e evidência                                                                                                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRUD de veículos/motoristas, viagens, calendário, manutenção, despesas | Implementado e preservado; suíte API e navegação E2E. Nem toda combinação operacional tem E2E individual                                                                          |
| Editor por clique, ordem/IDs, edição, publicação                       | Implementado; primeira parada corrigida, arraste, horário e busca municipal adicionados. Fluxo de persistência D1 local e aluno coberto por novo E2E                              |
| Login fictício por nome, escola, seleção/favorito                      | Implementado; sessões restritas, sem matrícula nem vínculo obrigatório de visualização                                                                                            |
| Mapa PB e Campina inicial                                              | Implementado; busca223 sedes IBGE, coordenadas livres e circuito OSM de Campina. Tiles externos precisam de rede                                                                  |
| Roteamento estadual completo                                           | Parcial: rede local Campina/Salvador, Valhalla opcional fora dela. Busca/cadastro/GPS não são limitados a esses recortes                                                          |
| ETA, caminhada, recomendação                                           | Implementado e testado no domínio/API; precisão de campo e trânsito não homologados                                                                                               |
| GPS nativo, permissões, buffer, reconexão                              | Implementado e APK compilado; validação física com tela bloqueada pendente                                                                                                        |
| Avisos, pane/resolução, espera, leitura                                | Implementado; autorização e persistência local testadas                                                                                                                           |
| Web Push                                                               | Implementado como melhor esforço; sem ensaio físico de entrega nem retry durável                                                                                                  |
| Simulador                                                              | Preservado, separado de GPS; cenário Campina adicionado                                                                                                                           |
| Segurança                                                              | RBAC, escopo, validação, quotas, CSRF, triggers e testes automatizados; limitações em SECURITY.md                                                                                 |
| Cloudflare remoto/dois aparelhos                                       | Configuração preparada. Deploy V6 e endpoint de participantes não publicados nesta etapa                                                                                          |
| Logo                                                                   | Logo oficial enviada em10/11 integrada ao web/PWA/Android, original preservado sem redesenho                                                                                      |
| Progresso e parada automática                                          | Trecho restante calculado das posições aceitas; permanência por120s detectada no backend. D1, aluno e Driver integrados; testes sintéticos aprovados, homologação física pendente |
| I.See Bus/hardware4G/telemetria comercial                              | Futuro, fora do escopo                                                                                                                                                            |

Não foram identificados módulos inteiros redundantes que justificassem remoção. Vinext entrega shell/Worker e React Router mantém navegação da aplicação; migrar framework não era necessário.
