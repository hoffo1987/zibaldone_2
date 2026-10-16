const benchmark = process.env.CIRCUITO_BENCHMARK === '1';
module.exports = {
  expo: {
    name: benchmark ? 'Circuito Test Nativo' : 'Il Circuito Nativo', slug: 'il-circuito-native', version: '0.1.0',
    icon: './assets/icon.png', scheme: 'circuito-native', userInterfaceStyle: 'automatic',
    ios: { supportsTablet: true, bundleIdentifier: 'com.IlCircuito.nativepreview', buildNumber: '1' },
    android: { package: benchmark ? 'com.IlCircuito.nativebenchmark' : 'com.IlCircuito.nativepreview', versionCode: 1, allowBackup:false, blockedPermissions:['android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE','android.permission.SYSTEM_ALERT_WINDOW'], adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#0A4F49' } },
    plugins: ['expo-router', 'expo-font', 'expo-asset', ['expo-build-properties', { android: { cmakeVersion:'3.31.6', enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }]],
    extra: { benchmark },
  },
};
