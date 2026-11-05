# Aplicativo Android TrackBus Driver (`DRIVER.md`)

O **TrackBus Driver** ([`apps/driver/`](../apps/driver/)) é o aplicativo nativo Android desenvolvido em **Expo SDK 58 / React Native 0.88.1** para operação em campo pelos motoristas escolares e para demonstração com GPS real em segundo plano durante a **FECT** e a **Congretech**.

---

## 1. Arquitetura e Componentes do Aplicativo

| Arquivo | Responsabilidade |
| :--- | :--- |
| [`apps/driver/App.tsx`](../apps/driver/App.tsx) | Interface operacional de alto contraste (preto e amarelo), fluxo de pareamento por código de 6 dígitos, seleção de viagem, confirmação obrigatória de veículo parado (`safeStop`) e botões rápidos de operação. |
| [`apps/driver/tracking.ts`](../apps/driver/tracking.ts) | Definição da tarefa em segundo plano (`TaskManager.defineTask`), gerenciamento do serviço em primeiro plano (`expo-location`), armazenamento criptografado no `Expo SecureStore` e fila offline de reenvio. |
| [`apps/driver/app.json`](../apps/driver/app.json) | Manifesto Expo/Android (`package: "br.com.iseetechnologies.trackbusdriver"`, permissões de localização em segundo plano e serviço de foreground). |
| [`apps/driver/build-apk.ps1`](../apps/driver/build-apk.ps1) | Script automatizado PowerShell para compilação local do APK Release assinado (`arm64-v8a`), geração de keystore protegido por DPAPI e verificação com `apksigner`. |

---

## 2. Pareamento Seguro por Código de 6 Dígitos

Para eliminar a digitação de senhas complexas ao volante ou durante a apresentação na feira:

1. **Geração no Painel Web**: O administrador ou motorista acessa a tela `/driver` no painel web e clica em **Gerar código do app**.
2. **Emissão Criptográfica (`POST /api/driver/pair`)**: O backend gera um código de **6 caracteres** (ex.: `7K9M2P`), válido por **2 minutos** e de **uso único**, salvando apenas seu hash SHA-256 na tabela `driver_pair_codes`.
3. **Troca no Android (`POST /api/driver/exchange`)**: No aplicativo Android, o motorista informa a URL do servidor e o código de 6 dígitos. O backend valida o código, marca `used_at` e retorna um token de dispositivo (`driver_device`) válido por 14 dias.
4. **Armazenamento Seguro**: O token `Bearer` é salvo no hardware keystore do Android via `Expo SecureStore` com a política `SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
5. **Revogação Instantânea**: O vínculo pode ser revogado a qualquer momento tanto pelo botão **Desconectar dispositivo** no app quanto pela central administrativa web (`POST /api/driver/revoke`).

---

## 3. Rastreamento GPS em Segundo Plano (Foreground Service)

O Android restringe severamente a coleta de localização em segundo plano a menos que um **Foreground Service** visível esteja ativo. O módulo [`apps/driver/tracking.ts`](../apps/driver/tracking.ts) implementa:

- **Tarefa Registrada**: `trackbus-driver-location-v3` via `expo-task-manager`.
- **Permissões Android Declaradas**:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_LOCATION`
- **Configuração de Captura (`startBackgroundTracking`)**:
  - `accuracy: Location.Accuracy.High`
  - `timeInterval: 4000` (4 segundos)
  - `distanceInterval: 8` (8 metros)
  - `pausesUpdatesAutomatically: false`
  - Notificação persistente na barra de status do Android:
    - **Título**: `TrackBus Driver em rota`
    - **Corpo**: `Transmitindo localização da viagem para os estudantes.`
    - **Cor**: `#FACC15`
- **Fila Resiliente Offline (`PENDING_KEY`)**:
  - Quando o callback da tarefa recebe novas coordenadas do sistema operacional, ele lê a fila pendente no `SecureStore`, adiciona a leitura atual (mantendo até as 20 posições mais recentes) e envia em ordem cronológica para `POST /api/gps` com `source: "gps"`.
  - Se o celular atravessar uma área de sombra de rede móvel ou Wi-Fi, os pacotes permanecem na fila e são despachados automaticamente no próximo pulso com conectividade.

---

## 4. Segurança Operacional ao Volante (`safeStop`)

A interface do aplicativo Android foi desenhada para evitar distração durante a condução:
- **Botões largos de toque único** e tipografia de alto contraste (`#090909` e `#FACC15`).
- **Trava de Veículo Parado (`safeStop`)**: Ações que exigem atenção ou alteram o fluxo da viagem (**Pausar**, **Chegada na parada**, **Aguardar 5 minutos**, **Encerrar espera**, ** +5 min / +10 min de atraso** e **Pane mecânica**) exigem que o motorista marque a confirmação *"Confirmo que o ônibus está parado em local seguro"* (`safeStop = true`).
- O backend também valida `safeStop` em `/api/driver/trips/:id/status`, `/api/driver/trips/:id/wait` e `/api/driver/incidents`, recusando com `400 Confirme que o veiculo esta parado em seguranca antes desta acao` caso a flag não seja enviada.
- **Retomada após Pane Resolvida**: Quando uma viagem entra em estado `interrupted` por pane mecânica e a equipe operacional resolve a ocorrência, o aplicativo habilita o botão **Retomar viagem** para continuar o percurso sem perder o histórico.

---

## 5. Compilação Local Reprodutível do APK (`build-apk.ps1`)

O script [`apps/driver/build-apk.ps1`](../apps/driver/build-apk.ps1) compila o APK de produção (`Release`) diretamente na máquina Windows local, sem depender de filas pagas na nuvem:

### Pré-requisitos de Ambiente
- **JDK 21** (ex.: Microsoft OpenJDK 21)
- **Android SDK** (`platform-tools`, `build-tools;36.0.0`, `ndk;27.1.12297006`)

### Comando de Compilação
```powershell
powershell -ExecutionPolicy Bypass -File apps/driver/build-apk.ps1
```

### Etapas Executadas pelo Script
1. Configura `JAVA_HOME`, `ANDROID_HOME` e codificação UTF-8.
2. Verifica ou gera um certificado RSA-3072 (`work/signing/trackbus-release.p12`) cuja senha aleatória é criptografada com **DPAPI do usuário Windows** (`work/signing/trackbus-release.pass.dpapi`), evitando senhas em texto puro no disco.
3. Executa `npx expo prebuild --platform android` caso o projeto nativo ainda não tenha sido gerado.
4. Executa `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` com minificação e assinatura Release V2.
5. Copia o APK final para `work/TrackBus-Driver-v3.apk` e valida a assinatura criptográfica com `apksigner verify --verbose`.
