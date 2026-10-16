param([string]$Architectures = 'arm64-v8a')
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
  if (-not $env:JAVA_HOME) {
    $taskJdk = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.jdks') -Directory | Where-Object Name -Like '*21*' | Select-Object -First 1
    if ($taskJdk) { $env:JAVA_HOME = $taskJdk.FullName }
  }
  if ($env:JAVA_HOME) { $env:PATH = "$env:JAVA_HOME/bin;$env:PATH" }
  $env:NODE_ENV = 'production'; $env:CI = '1'
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE) { throw 'Native project generation failed' }
  Push-Location android
  try {
    .\gradlew.bat :app:assembleRelease --no-daemon "-PreactNativeArchitectures=$Architectures" --max-workers=4
    if ($LASTEXITCODE) { throw 'Release build failed' }
  } finally { Pop-Location }
  $taskOutput = Join-Path (Split-Path (Get-Location).Path -Parent) 'dist-apk'
  New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination (Join-Path $taskOutput 'IlCircuito-Nativo-0.1.0.apk') -Force
  Write-Output "APK Release: $taskOutput/IlCircuito-Nativo-0.1.0.apk"
} finally { Pop-Location }
