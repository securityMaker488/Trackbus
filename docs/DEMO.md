# Roteiro de Demonstração — FECT e Congretech (`DEMO.md`)

Este guia descreve o roteiro passo a passo para apresentar o **TrackBus** ao vivo para avaliadores, professores e estudantes durante a **FECT** e a **Congretech** (Rua Caetano Moura, Federação — Salvador/BA).

---

## 1. Preparação do Ambiente (5 minutos antes da banca)

1. **Painel Principal (Notebook / Telão)**:
   - Abra o sistema no navegador em modo **Coordenação (`admin`)**.
   - Na barra superior amarela (**Modo demonstração controlado**), clique no botão **`Preparar circuitos da Congretech`**.
   - O sistema criará/atualizará automaticamente duas rotas reais passando pela **Rua Caetano Moura**:
     - **`LIN-101` — Circuito Caetano Moura — Simulado**: viagem ativa em modo `simulation`, pronta para demonstração imediata em bancada.
     - **`LIN-102` — Circuito Caetano Moura — GPS Real**: viagem agendada/ativa em modo `gps`, atribuída ao motorista demonstrativo **Carlos Mendes**, pronta para receber coordenadas do celular Android.
2. **Abertura da Sala Pública Smart Journey**:
   - Na barra superior, verifique se o seletor da sala está em **`Sala aberta`**. Caso esteja fechada, clique para abrir.
3. **Pareamento do Celular Android (`TrackBus Driver`)**:
   - No notebook, acesse a aba **Motorista (`/driver`)** e clique em **`Gerar código do app`** para o motorista **Carlos Mendes**.
   - No celular Android com o APK **TrackBus Driver v3** instalado, digite o código de 6 dígitos exibido na tela e toque em **`Conectar dispositivo`**.
   - O celular carregará automaticamente a viagem **`LIN-102` (GPS Real)**.

---

## 2. Roteiro de Apresentação ao Vivo (6 a 8 minutos)

### Etapa 1 — Visão da Coordenação e Separação GPS Real vs. Simulação (1,5 min)
- No telão (`/dashboard`), mostre os indicadores operacionais em tempo real: viagens ativas, estudantes confirmados, pontualidade e alertas.
- Destaque os dois selos distintos nas viagens:
  - **`Simulação`** (`LIN-101`): controlada pelo botão **`Simular passo`** ou **`Auto simular`** na barra superior.
  - **`GPS real`** (`LIN-102`): alimentada exclusivamente por hardware GPS (bloqueada por trigger no banco contra dados de simulação).
- Clique em **`Auto simular`** na `LIN-101` para mostrar o ônibus se deslocando suavemente sobre o traçado viário real da Rua Caetano Moura.

### Etapa 2 — Entrada dos Avaliadores e Alunos na Smart Journey (`/participar`) (2 min)
- Convide os avaliadores ou visitantes do estande a abrirem `/participar` no próprio celular (via QR Code ou link).
- O visitante digita apenas seu **Nome** e escolhe a **Escola**, entrando imediatamente na **Smart Journey** sem precisar de cadastro prévio complexo.
- No celular, o visitante seleciona:
  1. A linha desejada (`LIN-101` ou `LIN-102`).
  2. Sua parada de embarque (ex.: **Congretech — Rua Caetano Moura** ou **Escola Politécnica UFBA**).
- Mostre que o cartão exibe imediatamente o **ETA (previsão de chegada em minutos)** e a distância do ônibus até aquela parada.

### Etapa 3 — Cálculo de Caminhada sobre a Malha OSM de Salvador (1,5 min)
- No celular do visitante (em `/participar`) ou no **Portal do Aluno/Responsável (`/portal`)**, toque em **`Calcular caminhada até a parada`**.
- Destaque para a banca:
  - O cálculo utiliza o **grafo viário local OpenStreetMap de Salvador** (`26.006 nós` e `27.651 arestas`) embarcado no Worker, calculando o caminho real pelas calçadas sem depender de APIs pagas externas.
  - O sistema cruza o **ETA do ônibus**, o **tempo de caminhada a pé** e a **margem de segurança (3 min)** para recomendar: **`Aguardar`**, **`Saia em X min`**, **`Saia agora`** ou **`Risco de atraso`**.
  - Ressalte a **privacidade por concepção**: a coordenada do aluno é processada apenas em memória e nunca é salva no banco de dados.

### Etapa 4 — Operação no App Android `TrackBus Driver` e GPS em 2º Plano (2 min)
- Mostre o aplicativo nativo **TrackBus Driver** no celular Android conectado à `LIN-102`:
  1. Toque em **`Iniciar viagem com GPS`** — mostre a notificação persistente do serviço em segundo plano no Android e bloqueie a tela do celular para demonstrar que o GPS continua transmitindo.
  2. Marque a trava de segurança **`Confirmo que o ônibus está parado em local seguro`** (`safeStop`).
  3. Toque em **`Aguardar 5 minutos`** na parada atual — mostre que instantaneamente os celulares dos alunos em `/participar` recebem o aviso de espera autorizada e o ETA das próximas paradas aumenta em 5 minutos.
  4. Toque em **`Encerrar espera`** para normalizar o fluxo.
  5. Toque em **`Pane mecânica`** — mostre que a viagem muda automaticamente para **`Interrompida`**, um incidente crítico é aberto no painel da coordenação e um alerta urgente aparece para todos os passageiros da linha.
  6. No painel da coordenação (`/incidents`), clique em **`Resolver`** na ocorrência e, de volta ao celular Android, toque em **`Retomar viagem`**.

---

## 3. Plano de Contingência para Ambientes Fechados (Sem Sinal de Satélite)

Auditórios e pavilhões cobertos podem atenuar o sinal de satélites GPS ou a rede móvel das operadoras. O TrackBus possui contingências nativas para garantir 100% de fluidez na apresentação:

1. **Contingência de Sinal GPS Indoor**:
   - Enquanto a `LIN-102` demonstra o vínculo real com o app Android e os comandos operacionais (iniciar, aguardar 5 min, atraso, pane mecânica), a `LIN-101` (`Circuito Caetano Moura — Simulado`) garante movimentação contínua no mapa mesmo em subsolo ou pavilhão fechado.
2. **Contingência de Internet / APIs Externas**:
   - Todo o motor de rotas de ônibus e de caminhada na região da feira (Federação / Caetano Moura / Salvador) roda localmente sobre [`packages/geodata/salvador.json`](../packages/geodata/salvador.json), com tempo de resposta inferior a `25 ms` e zero dependência de internet externa.
3. **Restauração Instantânea entre Bancas**:
   - Ao final de cada apresentação, clique em **`Restaurar dados demo`** e depois em **`Preparar circuitos da Congretech`** na barra superior para zerar ocorrências e reposicionar os veículos em menos de 2 segundos.
