# Evidências de qualidade — 3 de novembro de 2026

## Verificado nesta entrega

| Verificação                 | Resultado                          | Alcance                                                                                                   |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| TypeScript estrito          | Passou                             | `npm run typecheck`                                                                                       |
| ESLint                      | Passou, zero erros/avisos          | Código de aplicação, domínio, API, testes e Worker                                                        |
| Vitest                      | 30 testes passaram em 3 arquivos   | 13 domínio/validação, 15 API/D1 e 2 contrato Valhalla                                                     |
| Playwright / Edge           | 4 cenários passaram                | Persistência, módulos, avisos entre contextos, restrição do aluno, simulador/ETA entre contextos e mobile |
| Segurança estática limitada | Zero achados                       | Regras para código dinâmico, HTML inseguro, sessão em localStorage e literais de segredo                  |
| `npm audit`                 | Zero vulnerabilidades reportadas   | Dependências de produção e desenvolvimento do lockfile final; consulta realizada nesta data               |
| Build de produção           | Passou                             | Shell Vinext, Worker e cliente; artefatos em `dist`                                                       |
| Migrações                   | Aplicadas e exercitadas localmente | D1 local e banco isolado da suíte de integração                                                           |

O ESLint verifica o código da aplicação; scripts e adaptadores de plataforma do starter estão fora desse conjunto. As dependências de ferramentas receberam overrides versionados para advisories, incluindo minimatch 11.0.4; lint e build verificam a compatibilidade usada pelo projeto. Auditoria sem alertas não equivale a ausência de vulnerabilidades desconhecidas.

O build apresenta avisos do Vinext/RSC sobre sourcemaps e chunks grandes. Não há erro de compilação, mas divisão adicional do bundle e medição em aparelhos de baixa capacidade continuam pendentes. O mapa é carregado dinamicamente. Não foi produzido benchmark de desempenho.

## O que os testes comprovam

- Anônimo e conta sem vínculo são recusados; CSRF de outra origem é recusado; instituições e referências de registros são isoladas.
- Motorista só opera viagens atribuídas; aluno/responsável não obtêm coleções administrativas; cookie demo não substitui a identidade proprietária.
- Cadastro e viagem persistem, conflitos de recursos são recusados e estados inválidos não são aplicados.
- GPS rejeita tempo, precisão, repetição, frequência e deslocamento inválidos. ETA usa itinerário e recusa traçado esquemático como previsão real.
- Atraso substitui o prazo anterior, pane interrompe a viagem, resolução retoma, espera é limitada e não se renova na mesma parada.
- Embarque exige perfil/viagem e sequência corretos, sem duplicidade; manutenção/despesas e auditoria persistem.
- Cadastro sobrevive à recarga no navegador. Aviso e posição simulada são recebidos em outro contexto; o aluno vê um ETA explicitamente simulado.
- Em viewport 390 × 844 não há overflow horizontal do documento, o menu abre e o diálogo fecha por Escape. Tabelas têm rolagem própria.

Os testes de navegador são locais, em contextos separados do mesmo computador, com identidade do adaptador de desenvolvimento. Não equivalem a celulares físicos em redes distintas nem a uma auditoria completa WCAG. Os tiles externos OSM são bloqueados na automação; a camada local de geometria e marcadores é verificada. A inspeção visual das capturas desktop e mobile foi realizada.

## Pendente / não declarar concluído

1. Configuração de provedor real de rotas e caminhada, teste de contrato contra esse serviço e homologação dos trajetos. O adaptador existe, mas só foi testado com fixtures explícitas.
2. GPS físico em campo, retomada após suspensão, comportamento sob baixa conectividade e recebimento entre aparelhos em redes distintas.
3. Onboarding de instituições reais; login independente, recuperação de senha e MFA adicional. No ambiente entregue, a identidade é delegada ao Sites e o bootstrap cria demonstrações.
4. WebSocket/Durable Objects, Web Push, e-mail/SMS e fila de reentrega. Hoje há polling e avisos internos persistidos.
5. Seleção de múltiplos dependentes no portal, escalas recorrentes, substituição de veículo/motorista em viagem e correção auditável de embarques.
6. Paginação, pesquisa histórica completa, filtros/relatórios avançados, exportação de outros módulos e alertas persistentes de desvio de rota.
7. Retenção institucional completa, exclusão/exportação de dados pessoais conforme política aprovada, restauração de backup, teste de carga, injeção de falhas e revisão independente de segurança.
8. Instalação PWA em Android/iOS e revisão integral de acessibilidade. Manifesto, ícones, service worker e fallback offline estão implementados; instalação física ainda não testada.
9. Endurecer a atomicidade de fluxos que escrevem entidade, evento e auditoria em chamadas sucessivas: indisponibilidade parcial pode deixar registros incompletos. Não há promessa de entrega exatamente uma vez.

O workflow GitHub inclui verificação e CodeQL, mas o CodeQL/CI remoto não foi executado aqui. Não existe certificação LGPD, pentest ou aprovação para operação real nesta entrega.

## Próxima fase

Fechar o fluxo real de GPS → vias validadas → ETA → caminhada → recomendação em dois celulares, com provedor geográfico definido e instituição de teste autorizada. Depois, reforçar atomicidade/recuperação, completar identidade institucional e notificações e ampliar relatórios/operação. Preservar os testes existentes como regressão.

## Publicação

O comprovante final de publicação é entregue separadamente, com o status retornado pelo Sites, versão, commit e URL. Um build local bem-sucedido não é tratado como publicação concluída. O ambiente conserva acesso privado do proprietário.
