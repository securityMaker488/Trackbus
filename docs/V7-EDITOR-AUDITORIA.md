# Continuidade do editor — 14/11/2026

Workspace original preservado. Branch `main`; remoto `securityMaker488/Trackbus`. `git fetch` confirmou remoto em `ce6bc1f`, sem commits remotos exclusivos: dois commits locais à frente antes desta etapa. README remoto comparado ao local; documentação antiga descrevia apenas Salvador e foi preservada no histórico. Nenhuma alteração concorrente do Antigravity foi encontrada além do trabalho local identificado desta sessão. Sem reset, clean, pull ou push.

Recuperação: branch `checkpoint/pre-editor-20261114` e diff não destrutivo em `work/pre-v7-editor-20261114.patch`, seguido de commit da estabilização/publicação.

## Situação observada

| Recurso | Situação e evidência |
| --- | --- |
| Arquitetura | React/Vinext/Vite entrega shell e Worker; React Router faz navegação, Hono API, Drizzle/D1, Expo Driver. Preservada. |
| Login Access | Corrigido e validado na conta publicada; `redirect:error` não é suportado por Workerd. Teste de runtime acrescentado. |
| Rotas por clique/arraste, ordem, versão | Existentes; persistência e publicação remotas validadas. Desfazer/refazer, nomes automáticos de rota e prévia ainda incompletos nesta auditoria. |
| GPS no editor | Centralização existente; falta marcador/precisão e uso como origem. |
| POIs e nomes por referência | Ausentes no editor; mapa raster contém apenas rótulos não selecionáveis. |
| Rascunhos do motorista e aprovação | Ausentes; criação atual permitida somente ao administrador. |
| Paraíba | Busca nas 223 sedes e navegação livre existentes. Roteamento local Campina/Salvador; cobertura viária estadual exige provedor configurado. |
| Aluno/Smart Journey | Entrada por nome, rotas da escola, escolha/favorito, posição simulada, ETA e aviso validados remotamente em sessão independente. |
| Segurança | Isolamento e RBAC existentes; aluno recusado na gestão e edição. Novas permissões precisam de testes próprios. |
| Driver Android | APK compilado e download publicado com hash verificado. GPS físico/tela bloqueada não validados, sem aparelho conectado. Editor nativo ainda ausente. |
| Avisos/espera/progresso | Implementados e testados localmente. Aviso de atraso e simulação recebidos pelo aluno online. |

67 testes unitários/integração passaram em 14/11; typecheck, lint, scanner e build passaram. Seis E2E da etapa anterior permanecem evidência histórica; serão executados após as novas integrações.

Próxima fase: completar editor e permissões preservando IDs, versões e viagens; integrar POIs por consulta limitada e fonte licenciada, com indisponibilidade explícita. A publicação Cloudflare permanece autorizada na conversa; push GitHub continua sem autorização.
