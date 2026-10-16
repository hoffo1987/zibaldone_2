# Il Circuito — anteprima React Native

Prima schermata nativa per valutare la migrazione: accesso con l'account esistente, Diario,
ricerca, lettura integrale di testo formattato/immagini/disegni, estratti degli scritti completi,
tema chiaro/scuro e notifiche condivise con il sito. Liste, lettore e finestre usano componenti
React Native, non pagine in una WebView. L'app di prova ha package `com.IlCircuito.nativepreview`
e si installa accanto all'app Capacitor ufficiale.

È un prototipo di lettura: editor, podio 3D, easter egg, profili e pannello di valutazione
restano sul sito. Il link al sito è esplicito. Non sostituisce l'app completa.
L'aspetto riprende i font Instrument Sans/Bricolage Grotesque e i colori e le pagine del Diario;
non costituisce ancora una replica visiva completa di tutti gli effetti del sito.

## Sviluppo e compilazione

Richiede Node compatibile con Expo SDK 58, JDK 21, Android SDK/NDK (installati automaticamente
da Gradle se le licenze Android sono accettate), oppure Xcode su macOS per iOS.
Su Windows installare anche **CMake 3.31.6** da Android Studio → SDK Manager → SDK Tools:
la versione 3.22.1 contiene un Ninja che non gestisce i lunghi percorsi del codice generato.
Lo script Windows assegna temporaneamente una lettera di unità libera alla cartella del progetto
e la usa solo per gli oggetti CMake in `.optimization/cxx/`; le sorgenti restano nel percorso
originale. La lettera viene liberata anche se la compilazione fallisce.

```powershell
cd native
npm ci
npm run typecheck
npm run lint
npm test
npm run build:android
```

Il comando genera `android/` da `app.config.js` e copia l'APK Release arm64 in
`../dist-apk/IlCircuito-Nativo-0.1.0.apk`. Usa R8, riduzione risorse e Hermes; la firma è quella
di sviluppo del template, adatta alla prova locale. Per altri ABI:
`powershell -File scripts/build-android.ps1 -Architectures 'arm64-v8a,x86_64'`.

Per iOS, su macOS: `npx expo prebuild --platform ios`, poi `npx expo run:ios --configuration Release`.
Le cartelle generate sono ignorate; configurazione e dipendenze sono versionate.

## Dati e accesso

Si usa lo stesso Firebase del sito con le regole esistenti. I documenti pubblici sono letti
esclusivamente con `version == 2`. La proiezione del client elimina identità e, per i completi,
contenuto integrale e allegati anche se presenti per errore nel documento. Solo l'amministratore
può recuperare l'autore di un pensiero aperto. L'app non modifica scritti né voti.
Le ricevute di lettura delle notifiche sono le stesse del sito, private per account.

L'anteprima offline usa 80 pensieri e 4 estratti sintetici locali; non crea utenti né documenti.
Le credenziali si inseriscono esclusivamente nell'app e non devono essere inviate nella chat.

## Confronto delle prestazioni

Confrontare compilazioni Release sullo stesso telefono, con stessa pagina, stesso contenuto,
stesso tema e condizioni termiche comparabili. Il podio 3D non è incluso: nessuna conclusione
sulle sue prestazioni può essere ricavata da questo prototipo. Tempi di avvio della prima Activity,
tempo fino al contenuto pronto e fluidità dello scorrimento sono misure differenti.
Una schermata più semplice o un dataset diverso non dimostrano che tutta l'app sia più veloce.

`scripts/build-web-baseline.cjs` prepara in `.optimization/native-web-baseline/` una piccola
app WebView con i veri componenti Diario del sito e gli stessi 80 pensieri sintetici.
Richiede anche `npm ci` nella radice del repository per webpack e i componenti web.
È una prova di carico della schermata, non un benchmark dell'intera app ufficiale:
il sito normalmente mostra gruppi di 18 schede, mentre questa baseline ne monta 80.
Per compilare, eseguire il wrapper Gradle della radice con `-p .optimization/native-web-baseline`.
L'app di confronto usa `com.IlCircuito.webbenchmark` e non richiede l'accesso a Firebase.

`scripts/device-benchmark.cjs <package> <etichetta>` registra tre tracce Perfetto FrameTimeline
con gli stessi gesti su entrambe le app di prova. Richiede `ANDROID_SERIAL`, l'eseguibile ufficiale
Perfetto `trace_processor_shell.exe` in `.optimization/` e l'autorizzazione Android a inviare
gesti tramite ADB. L'app nativa deve essere nell'anteprima offline, mai in un account reale.
Le tracce e i CSV restano nella cartella ignorata `.optimization/native-measurements/`.
Gli eventuali risultati descrivono soltanto questa prova controllata; non autorizzano
affermazioni promozionali sulle prestazioni dell'app completa o del podio.

Font: pacchetti ufficiali Expo Google Fonts, con licenze OFL incluse nei relativi pacchetti.
