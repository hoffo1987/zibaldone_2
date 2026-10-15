import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.IlCircuito.app',
  appName: 'Il Circuito',
  webDir: 'build',
  backgroundColor: '#EDF2F1',
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
