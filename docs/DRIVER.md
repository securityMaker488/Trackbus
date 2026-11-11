# TrackBus Driver

Aplicativo Expo 58 / React Native 0.88.1, código em apps/driver. Android package `tech.isee.trackbus.driver`, versão 7.0.0, versionCode 8. Interface preta/amarela com branco para leitura e logo oficial fornecida pelo proprietário.

## Instalação e pareamento

Instale o APK arm64 em Android compatível, autorizando instalação somente para o arquivo fornecido. USB opcional: `adb install -r TrackBus-Driver-v7-arm64.apk`.
Crie/publique a rota e programe uma viagem GPS. No painel, Configurações → Conectar o motorista, escolha o motorista e gere o código. No app informe a origem HTTPS da API acessível ao aparelho e o código hexadecimal de 16 caracteres. Código dura 2min, uso único; Bearer dura 8h e fica no SecureStore. Uma URL privada do Sites que exige login no gateway não funciona diretamente no app. Para Cloudflare próprio, veja [configuração](CLOUDFLARE.md).

Selecione viagem GPS atribuída, confirme veículo parado e toque **Iniciar rota com GPS**. Conceda localização em primeiro e segundo plano e notificações quando solicitadas. Android usa serviço com notificação persistente. Há pausa, retomada, atrasos, ocorrências, espera de 5min, encerramento de espera, viagem/GPS e desconexão. Se a viagem iniciar e a coleta falhar, o app informa essa condição e permite ativar o GPS novamente.

## GPS

Tarefa global `trackbus-driver-location-v3`. Configuração Location.High, intervalo Android 5000ms e distância mínima 0m (permite leituras parado para confirmar permanência), iOS background configurado. Fila serial limita tentativa de envio a cada 5s. SecureStore guarda somente a última leitura pendente, descartada após 60s. Revogação, falta de permissão ou conflito terminal encerram transmissão. Não reproduz histórico atrasado como posição atual. Encerrar viagem pelo app desliga GPS antes da chamada; encerramento remoto é observado por polling ou resposta ao próximo envio.

A frequência real é controlada também pelo sistema operacional. Encerramento forçado, bateria e permissões podem interromper coleta. Segundo plano não foi homologado em aparelho físico nesta etapa; Expo Go e testes de API não substituem essa prova.

## Compilação Windows

Instalar dependências nativas com `npm ci --prefix apps/driver` e verificar `npm run typecheck --prefix apps/driver`. JDK 21 no JAVA_HOME/PATH; SDK Android 37, build-tools 37, NDK 27.1.12297006, CMake 3.22.1. A licença SDK foi aceita pelo proprietário.

```powershell
./apps/driver/build-apk.ps1 -SdkRoot 'C:/Android/sdk' -BuildCache 'C:/tb-build'
```

O script usa pasta curta quando necessário para evitar limite Windows de caminhos, executa prebuild e assembleRelease arm64-v8a, assina com chave de demonstração RSA3072 e verifica apksigner. APK fica em BuildCache/app/android/app/build/outputs/apk/release/app-release.apk quando usa staging. Senha da chave protegida por DPAPI; signing/_.p12 e _.dpapi são privados, nunca publicar. Certificado de demonstração não é credencial de login nem assinatura Play Store. Build iOS e distribuição de produção permanecem pendentes.

O Driver apresenta distância restante e permanência detectada pelo backend. Coleta só começa ao iniciar a viagem atribuída e ativar GPS; não começa ao ligar o telefone. Leituras marcadas `mocked` pelo sistema são recusadas no app, sem substituir verificação física ou atestado de integridade do aparelho. Parâmetros e limitações conferidos na [documentação oficial Expo Location](https://docs.expo.dev/versions/latest/sdk/location/).
