param([Parameter(Mandatory)][string]$SdkRoot,[Parameter(Mandatory)][string]$BuildCache)
$ErrorActionPreference='Stop'
$env:ANDROID_HOME=(Resolve-Path -LiteralPath $SdkRoot).Path
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:CI='1'
$buildDirectory=[IO.Path]::GetFullPath($BuildCache)
[void](New-Item -ItemType Directory -Force $buildDirectory)
$env:GRADLE_USER_HOME=Join-Path $buildDirectory 'g'
$signingDirectory=Join-Path $buildDirectory 'signing'
[void](New-Item -ItemType Directory -Force $signingDirectory)
$env:TB_DEMO_STORE=Join-Path $signingDirectory 'trackbus-demo.p12'
$protectedFile=Join-Path $signingDirectory 'password.dpapi'
if((Test-Path $env:TB_DEMO_STORE) -and !(Test-Path $protectedFile)){throw 'Senha protegida da chave de demonstração ausente'}
if(!(Test-Path $protectedFile)){
  $randomPassword=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  ConvertTo-SecureString $randomPassword -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedFile
}
$protected=(Get-Content -Raw -LiteralPath $protectedFile).Trim() | ConvertTo-SecureString
$env:TB_DEMO_PASSWORD=[Net.NetworkCredential]::new('', $protected).Password
Push-Location $PSScriptRoot
try {
  if(!(Test-Path $env:TB_DEMO_STORE)){
    & keytool -genkeypair -storetype PKCS12 -keystore $env:TB_DEMO_STORE -storepass:env TB_DEMO_PASSWORD -keypass:env TB_DEMO_PASSWORD -alias trackbus-demo -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=TrackBus Demonstracao, O=I.See Technologies'
    if($LASTEXITCODE){throw 'Falha ao gerar chave de demonstração'}
  }
  & npx --no-install expo prebuild --platform android --no-install
  if($LASTEXITCODE){throw 'Falha no prebuild Android'}
  $gradleFile=Join-Path $PSScriptRoot 'android/app/build.gradle'
  $gradleText=Get-Content -Raw -LiteralPath $gradleFile
  if(!$gradleText.Contains('TB_DEMO_STORE')){
    if(!$gradleText.Contains('signingConfigs {') -or !$gradleText.Contains('signingConfig signingConfigs.debug')){throw 'Modelo Android de assinatura incompatível'}
    $gradleText=$gradleText.Replace('signingConfigs {',@'
signingConfigs {
        trackbusDemo {
            storeFile file(System.getenv('TB_DEMO_STORE'))
            storePassword System.getenv('TB_DEMO_PASSWORD')
            keyAlias 'trackbus-demo'
            keyPassword System.getenv('TB_DEMO_PASSWORD')
        }
'@)
    $index=$gradleText.LastIndexOf('signingConfig signingConfigs.debug')
    $gradleText=$gradleText.Substring(0,$index)+$gradleText.Substring($index).Replace('signingConfig signingConfigs.debug','signingConfig signingConfigs.trackbusDemo')
    Set-Content -LiteralPath $gradleFile -Value $gradleText
  }
  Push-Location android
  try { & .\gradlew.bat :app:assembleRelease --no-daemon --max-workers=2 --console=plain '-PreactNativeArchitectures=arm64-v8a'
    if($LASTEXITCODE){throw 'Gradle não concluiu o APK'}
  } finally {Pop-Location}
  $apk=(Resolve-Path 'android/app/build/outputs/apk/release/app-release.apk').Path
  & (Join-Path $env:ANDROID_HOME 'build-tools/37.0.0/apksigner.bat') verify --verbose --print-certs $apk
  if($LASTEXITCODE){throw 'Falha na verificação da assinatura'}
  Get-FileHash -LiteralPath $apk -Algorithm SHA256
} finally { $env:TB_DEMO_PASSWORD=$null;Pop-Location }
