import type { CapacitorConfig } from '@capacitor/cli';

// L'app apre il sito pubblicato: ogni aggiornamento web arriva subito anche a chi l'ha installata, senza un nuovo APK.
// Senza rete resta la pagina locale offline.html (copiata da public/ nella build impacchettata).
const SITO = 'https://ilcircuito.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.IlCircuito.app',
  appName: 'Il Circuito',
  webDir: 'build',
  backgroundColor: '#EDF2F1',
  server: {
    url: SITO,
    errorPath: 'offline.html'
  },
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
