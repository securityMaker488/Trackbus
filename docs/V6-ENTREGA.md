# Entrega local TrackBus V6.1 — 10 de novembro de 2026

## Resultado e escopo

Projeto existente preservado. Fluxo administrador → rota no mapa → D1 local → catálogo do aluno validado em dois contextos de navegador. APK Android real compilado e assinatura verificada. Não declarar MVP de campo concluído: ainda falta validar GPS com aparelhos físicos e disponibilizar endpoint HTTPS autorizado para a demonstração.

## Auditoria e recuperação

Branch main, commit inicial ce6bc1f4167fbfc323839617b1f8d6f2cdf5b5c8. GitHub securityMaker488/Trackbus e checkout estavam no mesmo HEAD; nenhuma mudança local pendente. Histórico anterior e merge da documentação preservados. Criados recovery/pre-v6-20261109 e bundle local trackbus-pre-v6-20261109.bundle fora do repositório. Nenhum reset/clean destrutivo, push ou publicação nesta etapa.

## Preservado

Stack React/TypeScript/Vite/Vinext, Hono/Workers/D1/Drizzle, Expo/React Native. Mantidos cadastros, versões/snapshots de rota, viagens, GPS/simulação separados, responsáveis, embarque, ausências, manutenção, despesas, calendário, relatórios e auditoria. Integrada a logo oficial enviada em10/11 sem redesenho; mantida identidade preta/amarela, migrações0000..0003, recorte OSM Salvador, project_id e audiência do Site. Sem nova licença open-source.

## Corrigido

Primeira parada passa a aparecer sozinha; câmera do editor não salta a cada clique. Arrastar marcador atualiza coordenadas e persiste. Formulário informa escola da sessão, horário de referência e ativação. Edição apenas descritiva preserva geometria viária; pontos conectados da rede local recebem cálculo ao salvar. Ações dos cartões de rotas quebram linha sem transbordamento.

Smart Journey recusa GPS pessoal impreciso/antigo e deixa de mostrar ETA atual quando a última posição envelhece, mesmo com falha de rede. Botão Push falha com mensagem quando falta Service Worker ativo, em vez de aguardar indefinidamente. Logout do visitante remove preferências, leituras e assinatura Push vinculadas.

Documentação antiga continha nomes de endpoints/tabelas inexistentes, código Android de6 caracteres, sessão de14dias e descrição incorreta dos testes. Esses pontos foram corrigidos contra o código. Não houve reescrita de framework ou descarte de módulos válidos.

## Implementado

Busca geográfica local das223 sedes municipais PB, fonte IBGE, e busca de coordenadas livres. Centro inicial de edição em Campina Grande. Recorte OSM central/Açude Velho integrado ao mesmo motor A\*, sem duplicar roteador. Circuito de871m/44vértices para ônibus/pedestre, com fontes e hashes registrados. Preparação idempotente cria circuitos GPS e simulação em Campina sem apagar rotas antigas.

Aluno recebe cartões de rotas, seleção/favoritos e leitura persistente de avisos. Polling web adaptativo5s/15s e suspensão com aba oculta. Android limita tentativa de envio a5s, mantém a última leitura recente protegida e remove permissões de armazenamento externo/overlay desnecessárias. Compilação usa pasta curta para Windows.

## Arquivos principais

- apps/web/App.tsx, Map.tsx, MapSearch.tsx, SmartJourney.tsx, PushChoice.tsx, styles.css, map-search.css.
- apps/api/index.ts, journey.ts, presentation.ts, seed.ts.
- apps/driver/tracking.ts, App.tsx, app.json, build-apk.ps1.
- packages/geodata/index.ts, campina\* e paraiba-places.json.
- db/schema.ts, packages/validation/index.ts, drizzle/0004_v6_route_schedule.sql e0005_gps_route_progress.sql.
- tests/integration/geography.test.ts, tests/unit/geodata.test.ts, testes API/E2E e configuração Playwright/CI.
- README e documentos técnicos revisados. Parte das linhas alteradas resulta de formatação de arquivos anteriormente compactados.

## Migração e dependências

Migração0004 adiciona departure_time em routes, vazio por padrão. Migração0005 adiciona locations.progress nullable para progresso/permanência derivados do GPS. Aplicada com sucesso no D1 local e em todos os bancos isolados de teste. Nenhuma migração remota aplicada.
Nenhuma dependência npm de produção adicionada, nenhum lockfile alterado. Extração cartográfica usou ferramenta Python temporária fora do produto; reconstrução dos assets normalizados funciona offline com biblioteca padrão.

## Verificações efetivamente executadas

| Verificação                    | Resultado                                                            |
| ------------------------------ | -------------------------------------------------------------------- |
| Auditoria inicial Vitest       | 42 testes aprovados                                                  |
| Suíte final Vitest/Miniflare   | 57 testes em7 arquivos aprovados                                     |
| Playwright/Edge final          | 5 cenários aprovados em3,4min                                        |
| TypeScript strict web/API      | Aprovado                                                             |
| TypeScript Driver              | Aprovado                                                             |
| ESLint                         | Aprovado                                                             |
| Scanner estático limitado      | Zero achados nos padrões verificados                                 |
| npm audit raiz e Driver        | Zero advisories reportados nesta consulta                            |
| Build produção web/Worker      | Concluído                                                            |
| D1 local                       | Migrações0004/0005 aplicadas; CRUD/reload/catálogo verificados       |
| Cartografia real               | 30 respostas de tiles HTTP200, sem sinalização de fonte indisponível |
| Gradle assembleRelease         | Concluído; APK arm64-v8a                                             |
| apksigner                      | Assinatura v2 verificada                                             |
| Android físico                 | Não executado; adb devices sem aparelhos                             |
| D1 remoto / deploy V6          | Não executados                                                       |
| GitHub Actions / CodeQL remoto | Não executados                                                       |

E2E cobre persistência de veículo, navegação administrativa, comunicação entre contextos, restrições do aluno, apelido/favorito, simulador, caminhada871m, mobile, clique/arraste, busca municipal, nova rota publicada e preferência após recarregar. A suíte bloqueia tiles por padrão; a verificação adicional acima carregou cartografia real. Integração usa D1 local Miniflare e coordenadas sintéticas de teste, nunca pretende demonstrar GPS físico.

Uma falha de expectativa antiga de ETA foi atualizada após confirmar cálculo viário automático. Um seletor E2E que encontrava option oculto foi corrigido e o cenário passou. O teste de Push sem credenciais passou a exigir503 e usa fixture explícita no D1 para verificar revogação, sem alegar entrega push.

Build concluiu com avisos do Vinext sobre sourcemaps/classificação estática e chunks grandes. Android registrou depreciações de ferramentas Expo/Gradle. Não houve erro impeditivo final.

## APK entregue

Arquivo local fora do Git: TrackBus-Driver-v6.1-arm64.apk.
Package tech.isee.trackbus.driver, versão6.1.0/code7, arm64-v8a, Android mínimoAPI24, target36/compile37. Tamanho24.111.816bytes.
SHA256: 894B29749E73B4ADEE9CB994B9D31E0F1F65D68C97DEDF93366D49E1B36F726D.
Certificado demo RSA3072, digestSHA256197bff1068247afa372490ca46934a8c539655120262ffb4eb8a17dc4c7865ea.
App.tsx, tracking.ts, app.json, index.ts, lockfile e logo conferidos iguais entre checkout e fonte compilada. Chave privada e senha DPAPI não foram incluídas no Git/artefatos de entrega.

## Limitações e riscos

Não há validação de GPS em segundo plano/tela bloqueada, perda de internet, reconexão física ou consumo de bateria. Push não foi homologado em aparelho. Mapas/cadastro/GPS cobrem coordenadas amplas, mas roteamento estadual completo não está disponível: fora dos recortes conectados depende de Valhalla institucional.

Site atual é privado. Endpoint acessível aos participantes/Android e publicação V6 dependem de configuração/autorização. Worker principal presume identidade protegida pelo gateway Sites; Cloudflare independente exige validação criptográfica de identidade. Auditoria independente, restore remoto e política institucional de retenção permanecem pendentes. Algumas escritas de eventos são sequenciais e push não tem retry durável. Detalhes em SECURITY.md.

## Execução, deploy e apresentação

[Execução/Cloudflare](DEPLOYMENT.md), [Driver/instalação](DRIVER.md), [roteiro Congretech em Campina](DEMO.md), [mapas](MAPS.md), [roadmap](ROADMAP.md), [diagnóstico](TROUBLESHOOTING.md). Primeiro ensaio pendente: instalar APK em aparelho autorizado, disponibilizar API HTTPS, parear motorista e testar o ciclo real completo com segundo celular. Nenhum serviço pago criado.

## Complemento solicitado em10/11

Logo oficial original copiada sem alteração para web e Driver; SHA256175C13F124B24B0B9E063B0DE5C8B376CD29049FF065E2CEFA411BB3C8CA3108. PWA/favicon/splash usam derivados de tamanho gerados pelo pipeline existente. Símbolo de ônibus do mapa permanece um ícone operacional.

Linha restante calculada no backend por posições validadas, sem extrapolação temporal. Trecho concluído discreto/pontilhado. Espera automática após120s de leituras contínuas perto da parada, removida ao movimento ou perda de qualidade. Não altera status administrativo nem o prazo da espera manual. API, mapa, Smart Journey e Driver recebem o mesmo progresso. Critérios e limites em GPS.md.

Android passa a solicitar leituras mesmo parado (distanceInterval0), mantendo limite de envio5s. Leituras que o SO identifica como simuladas são recusadas no fluxo GPS. APK6.1 real compilado, fontes comparadas com staging, assinatura e versão conferidas. Nenhum celular conectado ao adb; não há certificação física de precisão, bateria ou segundo plano. Nenhum push Git/deploy remoto autorizado ou executado.
