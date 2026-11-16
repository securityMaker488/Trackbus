# Testes e evidências

V7, 11/11/2026: **65 testes unitários/integração em 9 arquivos e 6 E2E aprovados**. Typecheck web e Driver, lint, scanner e build passaram; npm audit web/Driver sem vulnerabilidades reportadas. APK 7.0.0/code8 compilado e assinado. Layout e orientação PWA verificados em 1366×900 e 390×844. Modelo Cloudflare passou no dry-run e no smoke local do Worker compilado; recusou identidade forjada e entregou os recursos estáticos após correção do roteamento. Evidências em `docs/evidence/v7-*.json`. Ensaios reais Access, instalação PWA e Android/tela bloqueada permanecem pendentes. Os testes do navegador usam geolocalização controlada, não GPS físico.

## Histórico V6

Resultado em 10/11/2026: 57 testes unitários/integração em7 arquivos e 5 E2E aprovados; typecheck, lint, scanner, auditoria npm e build concluídos. APK6.1.0/code7 assinado verificado. A verificação visual adicional V6.1 carregou30 tiles HTTP200, com a logo oficial e progresso visível em simulação. Ensaio físico Android continua pendente. A auditoria inicial passou 42 testes em 5 arquivos. Foram encontrados erros na documentação anterior: contagens por suíte, endpoints Android e testes de hardware não correspondiam ao código; corrigidos nesta etapa.

Comandos efetivos:

```sh
npm run typecheck
npm run lint
npm test
npm run security
npm audit
npm run build
npm run test:e2e
npm run typecheck --prefix apps/driver
npm audit --prefix apps/driver
```

E2E usa servidor local na porta5173 e Edge/Chromium; aplica migrations no D1 local. Tiles OSM são bloqueados nesses testes para não depender de rede cartográfica. Os cliques são reais no canvas MapLibre, a API e o D1 são reais no ambiente local, sem mocks de cadastro.

Integração valida escopo institucional, visitante, pareamento, GPS, fechamento/espera, publicação, coordenadas/horário e localidades PB. Unitários validam domínio, geodados, adaptador externo e gateway. Nenhum teste de navegador/mocks comprova GPS Android físico.

A auditoria npm consulta advisories atuais; scanner local é limitado a padrões e não é pentest. GitHub Actions/CodeQL não foram executados remotamente nesta etapa. Logs em work são locais e ficam fora do Git; resultados finais em V6-ENTREGA.md.

V6.1 acrescenta oito testes de progresso/permanência e amplia integração de pareamento/GPS: posições sintéticas, relógio controlado, 120s até a espera, entrega via D1 ao aluno/motorista e retomada. E2E verifica a imagem oficial carregada e distância restante diminuindo na simulação. TypeScript detectou import ausente de inArray durante implementação; corrigido antes da suíte final. Verificações visuais suplementares são separadas dos cinco E2E.

## Preparação para ensaios físicos V11

Registro por aparelho: modelo, versão Android/iOS, navegador, versão APK, origem/API, rede, permissões e horário. Usar participantes autorizados e dados fictícios. Não há dispositivo Android conectado por ADB nesta etapa.

| Cenário | Evidência a registrar | Estado |
| --- | --- | --- |
| Driver inicia GPS, bloqueia tela por pelo menos 5 min, aluno vê posições | Última atualização em ambos; contador de envios; horários | Pendente físico |
| Rede interrompida, retomada e fim da viagem | Sem reproduzir posições antigas; nenhum novo envio após encerrar | Pendente físico |
| Aluno autoriza GPS e calcula caminhada real | Percurso reconhecido e coerência do tempo, sem localização no motorista | Pendente físico/provedor |
| Push com página fechada no Android | Recebimento no sistema, abertura da volta/parada e horário | Pendente físico/VAPID |
| iPhone instalado pela Tela de Início | Permissão por ação do usuário e entrega fechada | Pendente físico/VAPID |
| Dois participantes confirmam espera | Totais, cancelamento, expiração e nova volta sem nomes | Validado local; ensaio físico pendente |
| Google Demo Key em avaliação | Busca, POIs, rota DRIVE/WALK, limite, erro e consentimento negado | Pendente chave local |

Não publicar nem migrar o D1 remoto para executar estes testes sem autorização. O APK V11 requer a API V11; o Worker preservado continua na versão anterior. Não expor o servidor local com login simulado por túnel público. Testes Playwright com GPS controlado e contratos Google simulados são identificados somente como testes de software.

## Resultado atual V11 — 16/11/2026

88 testes de unidade/integração em 16 arquivos e 10 E2E aprovados. Typecheck web/Driver, lint, scanner limitado, auditoria npm completa web/Driver (0 ocorrências), build e dry-run passaram. Worker compilado local entregou 19 verificações HTTP/arquivos, recusou identidade forjada, serviu APK com hash esperado e executou Cron com outcome ok. Nenhum deploy, migração remota, segredo ou faturamento foi alterado. [Relatório completo](V11-AUDITORIA.md#resultado-da-fase-local--16112026) · [Evidência compilada](evidence/v11-compiled-local.json).

E2E cobre também confirmação/cancelamento de espera, retorno pelo link da notificação e recusa de volta antiga. A suíte D1 verifica tetos de quatro itens por serviço, autorização antes de envio e aproximação sem caminhada. Isso não comprova 10 ms de CPU no plano Free nem entrega com página fechada; [PERFORMANCE.md](PERFORMANCE.md) delimita o alcance.
