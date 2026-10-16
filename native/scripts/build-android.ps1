param([string]$Architectures = 'arm64-v8a')
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
  if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'cmake/3.31.6/bin/cmake.exe'))) {
    throw 'Install CMake 3.31.6 with Android Studio SDK Manager (SDK Tools) before building. Its Ninja supports long Windows paths.'
  }
  if (-not $env:JAVA_HOME) {
    $taskJdk = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.jdks') -Directory | Where-Object Name -Like '*21*' | Select-Object -First 1
    if ($taskJdk) { $env:JAVA_HOME = $taskJdk.FullName }
  }
  if ($env:JAVA_HOME) { $env:PATH = "$env:JAVA_HOME/bin;$env:PATH" }
  $env:NODE_ENV = 'production'; $env:CI = '1'
  $taskNativeRoot = (Get-Location).Path
  $taskRepoRoot = Split-Path $taskNativeRoot -Parent
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE) { throw 'Native project generation failed' }
  # Stage only CMake objects through a short alias; keep all source/codegen paths on C:.
  # Only the alias is removed afterward; the checkout and installed app are preserved.
  $taskDrive = @('R','S','T','U','V','W','X','Y','Z') | Where-Object { -not (Test-Path "${_}:\") } | Select-Object -First 1
  if (-not $taskDrive) { throw 'No free drive letter is available for the temporary native build alias.' }
  subst.exe "${taskDrive}:" $taskRepoRoot
  if ($LASTEXITCODE) { throw 'Cannot create temporary build alias' }
  Push-Location android
  try {
    .\gradlew.bat :app:assembleRelease --no-daemon "-PreactNativeArchitectures=$Architectures" '-Pexpo.android.cmakeObjectPathMax=240' "-PcircuitoCmakeStagingRoot=${taskDrive}:/.optimization/cxx" --max-workers=4
    if ($LASTEXITCODE) { throw 'Release build failed' }
  } finally { Pop-Location; subst.exe "${taskDrive}:" /D }
  $taskOutput = Join-Path $taskRepoRoot 'dist-apk'
  New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination (Join-Path $taskOutput 'IlCircuito-Nativo-0.1.0.apk') -Force
  Write-Output "APK Release: $taskOutput/IlCircuito-Nativo-0.1.0.apk"
} finally { Pop-Location }
