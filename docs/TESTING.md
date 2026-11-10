# Testes e evidências V6

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
