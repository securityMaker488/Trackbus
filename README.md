# TrackBus — transporte escolar

Plataforma funcional de demonstração da I.See Technologies, com interface em português, API autorizada e persistência D1. O ambiente inicial contém apenas dados fictícios para a FECT e a Congretech. Esta entrega é incremental: não está homologada para operação real com menores.

## Abrir

Publicação prevista no projeto privado existente: https://trackbus-operacao-escolar.goldensla6.chatgpt.site. A confirmação de implantação e o identificador da versão ficam no comprovante de entrega fora deste repositório.

Entre pela conta proprietária e clique **Abrir demonstração**. O seletor de perfil permite verificar as permissões de administrador, motorista, aluno, responsável e monitor no servidor. Não há senha demo embutida.

## Executar localmente

Requisitos: Node.js 24, npm e Git. No Windows, Edge instalado para a configuração padrão dos testes E2E.

```sh
npm run install:ci
npm run build
npm run db:migrate:local
npm run dev -- --port 5173
```

Abra http://127.0.0.1:5173. O adaptador Sites fornece identidade fictícia exclusivamente no desenvolvimento. As migrações são imutáveis; os dados ficam em `.wrangler/state`, fora do Git. O banco publicado é separado. `npm start` serve a compilação local; a autenticação nesse modo deve passar pelo gateway correspondente.

## Verificar

```sh
npm run typecheck
npm run lint
npm test
npm run security
npm audit
npm run build
```

Com o servidor de desenvolvimento iniciado, execute `npm run test:e2e`. Em outro sistema operacional, instale o Chromium do Playwright; `PLAYWRIGHT_CHANNEL` permite escolher um canal instalado. Relatório HTML: `work/playwright-report/index.html`. Rastros de falha: `work/e2e-results`. Os testes E2E bloqueiam requisições de tiles OSM para evitar tráfego repetitivo; verificam a camada local de rotas/paradas e os fluxos de dados.

## Implementado

- Cadastros persistentes de veículos, motoristas e alunos; vínculos de responsáveis e perfis institucionais.
- Editor de paradas, ordenação e versões de rota; viagem conserva seu itinerário original.
- Programação, conflitos de veículo/motorista, capacidade, calendário e máquina de estados com controle de concorrência.
- GPS autorizado do navegador, mapa MapLibre, posição recente/desatualizada e simulador explicitamente identificado.
- ETA por projeção na geometria, faixa de tempo, espera e atraso; recusa previsão real para traçado esquemático.
- Adaptador Valhalla para vias e caminhada, sem provedor externo configurado. A comparação de tempos tem margem de três minutos.
- Avisos direcionados, confirmações de leitura, pane mecânica, ocorrências, retomada e histórico.
- Embarque/desembarque, ausências, manutenção, despesas, relatório CSV e auditoria.
- Layout responsivo, diálogos acessíveis, manifesto PWA e fallback offline sem dados pessoais.

## Evidência e limites

Veja [QUALIDADE.md](docs/QUALIDADE.md) para a matriz de testes e pendências. Uma tela existente não significa homologação de todo o módulo. Os testes de API usam D1 real em workerd/Miniflare e identidades de teste; não comprovam o gateway hospedado nem GPS físico. As respostas do provedor geográfico nos testes são fixtures explícitas, não tráfego real.

O login está delegado ao Sites. Senhas próprias, recuperação e MFA adicionais não foram implementados. A atualização entre sessões usa polling autenticado de cinco segundos, ainda sem WebSocket/Durable Objects. Notificações são internas ao aplicativo; não há Web Push, SMS ou e-mail. A seleção de múltiplos filhos no portal, escalas recorrentes, substituição durante viagem, correção auditável de embarque, filtros históricos/paginação e relatórios avançados ainda precisam de implementação.

Antes de uso real: configurar provedor de rotas, testar GPS em celulares distintos, homologar operação/privacidade com a instituição, testar restauração de backup e executar revisão independente de segurança.

## Organização

```text
apps/web/           React, MapLibre, formulários e interface
apps/api/           Hono, autorização, operação e adapter Valhalla
packages/domain/    estados, GPS, geometria, ETA e saída
packages/validation schemas Zod
packages/shared/    contratos de leitura
app/ + worker/      shell Vinext e integração Sites
 db/ + drizzle/     schema Drizzle e migrações D1
 tests/             domínio, integração e E2E
 docs/              arquitetura, segurança, API e operação
```

React/TypeScript estrito, Vite/Vinext, Hono, Drizzle/D1, TanStack Query, React Hook Form, Radix, Zod, MapLibre, Recharts, Tailwind/CSS, Vitest e Playwright. O estado local usa hooks e o remoto usa Query; não foi necessário adicionar Zustand. O service worker público é pequeno e explícito, sem Workbox. Dependências sem uso do modelo inicial foram removidas.

## Documentação

- [Roteiro de demonstração, GPS e contingência](docs/OPERACAO.md)
- [API e limites de consulta](docs/API.md)
- [Arquitetura e decisões](docs/architecture/DECISIONS.md)
- [Modelo de ameaças e riscos remanescentes](docs/security/THREATS.md)
- [Evidências de qualidade e próxima fase](docs/QUALIDADE.md)

Não colocar tokens ou senhas no repositório. O Worker depende do gateway autenticado do Sites; uma publicação independente requer outro mecanismo de autenticação validado. A ferramenta `security` é uma varredura limitada de padrões e segredos, não um pentest. O workflow CodeQL está configurado para GitHub, mas não foi executado nesta entrega local.
