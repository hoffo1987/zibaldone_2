# zibaldone_2 · Il Circuito
Created with CodeSandbox

## Diario e scritti completi

Ogni invio sceglie tra **Scritto completo** e **Pensiero del diario**. La scelta resta fissa dopo la pubblicazione;
titolo, testo, foto e disegni restano modificabili. Gli scritti precedenti sono considerati completi.

- Il Diario è leggibile per intero da tutti gli utenti registrati, senza nomi né date pubbliche. Solo autore e admin
  possono conoscere l'identità. Non riceve voti, stati, note di valutazione o segnalibri e non partecipa al podio.
- Chi legge un pensiero del diario di un altro può accendere una **scintilla** su una frase (da 3 parole a 280
  caratteri, al massimo 5 per pensiero), con un'emozione fissa e una nota facoltativa. Una scintilla non è un voto:
  niente punteggi né totali pubblici. La vedono solo l'autore, senza sapere chi l'ha accesa, e gli admin; chi la accende
  vede soltanto le proprie. `pensieri/{id}/scintille/{sid}` non ha uid né orario (solo il giorno) e ha un id casuale;
  chi l'ha accesa sta in `scintille_mie/{uid}/voci/{sid}`, il tetto di 5 in `scintille_mie/{uid}/pezzi/{id}`. Le
  notifiche dell'autore le calcola il suo client: nessuno scrive in `notifiche` tranne l'admin per i voti.
- In **I miei scritti** il riquadro «Le tue scintille» (`src/ScintilleMie.tsx`) raccoglie le scintille ricevute sui
  propri pensieri (anonime, le stesse delle notifiche) e quelle accese da sé sui pensieri degli altri; toccando una
  frase si apre il pensiero. Toccando l'intestazione la sezione si ritrae e resta la riga con i due conteggi; la scelta
  si ricorda su quel dispositivo.
- Da una frase si può **rispondere con un pensiero**: il nuovo pensiero porta `nataDa` (id dell'origine e citazione),
  immutabile dopo la pubblicazione, e il lettore mostra a tutti quanti pensieri sono nati da uno. Firestore espone a chi
  legge un documento anche la sua data di creazione tecnica: l'orario esatto di una scintilla non è quindi segreto
  per l'autore, anche se l'app mostra solo il giorno.
- Gli scritti completi partecipano alla selezione mensile. Gli altri utenti ricevono un estratto di al massimo il 30%
  del testo e 480 byte; il lettore mostra un avviso. HTML integrale, immagini e disegni restano all'autore e agli admin.
- `pensieri/{id}` contiene l'originale privato. `testi/{id}` versione 2 contiene esclusivamente la proiezione consentita,
  senza identità o valutazioni. Salvataggio e modifica delle nuove pagine aggiornano entrambi i documenti atomicamente.
- Le regole negano le vecchie copie pubbliche integrali, anche se richieste direttamente o da una vecchia app.
  Le vecchie app possono ancora salvare originali privati come scritti completi. Il nuovo client aggiorna le proiezioni
  degli originali accessibili all'utente; l'admin sincronizza l'archivio completo.

Il progetto Firebase esistente è configurato in `.firebaserc`. Per verificare le regole localmente (JDK 21):

```sh
npx firebase-tools emulators:exec --only firestore --project demo-circuito 'npm run test:rules'
```

La CI esegue questi test senza credenziali o accesso ai dati reali. Dopo averli verificati, le regole si distribuiscono
con `npx firebase-tools deploy --only firestore:rules`. I backup dei dati sono locali e ignorati da Git.

## Sviluppo e verifica

Gli aggiornamenti riusciti di `main` generano automaticamente un annuncio nel pannello Notifiche, per tutti gli
utenti. La pipeline pubblica dopo controlli, build Android/iOS e conferma del deployment di produzione Vercel;
ignora revisioni superate e modifiche alla sola documentazione. Un nuovo tentativo dello stesso commit non duplica
l’annuncio. **Ogni modifica dell'app deve aggiornare `release-notes.json` nello stesso commit**, con un titolo e
un breve riepilogo in italiano delle modifiche effettive. Il file contiene direttamente `titolo` e `messaggio`
dell'aggiornamento corrente, indipendentemente dalla versione Android. Non esiste un messaggio generico di riserva.
`npm run check:release-notes` controlla le modifiche locali prima del commit; in CI controlla il commit pubblicato
e rifiuta riepiloghi mancanti, generici o uguali al precedente. Le istruzioni permanenti per tutte le AI e chat
sono in [AGENTS.md](AGENTS.md).

Gli annunci sono immutabili in `aggiornamenti/{commit}`. Le letture sono private per account, in
`letture_aggiornamenti/{uid}/annunci/{commit}`, e si sincronizzano tra dispositivi. La CI accede con un utente tecnico
non amministratore, configurato con i segreti GitHub `FIREBASE_RELEASE_EMAIL` e `FIREBASE_RELEASE_PASSWORD`;
non conserva credenziali Google di amministrazione nel repository. Le regole consentono la pubblicazione soltanto
agli admin e alle identità registrate in `release_publishers`.

Il download Android al login resta neutro: non sono disponibili benchmark comparativi su dispositivo che dimostrino
prestazioni migliori del browser. L’app Capacitor esegue lo stesso codice web in Android WebView.

`npm run test:releases` verifica che annunci duplicati, deploy falliti o revisioni superate non producano notifiche.

Usare Node.js 24 e il lockfile npm incluso:

```sh
npm ci
npm run typecheck
npm run typecheck:egg
npm test -- --watchAll=false --runInBand
npm run build
npm start
```

Tailwind e gli stili dell'interfaccia sono compilati nella build: non serve il CDN Tailwind a runtime.
La workflow `Site checks` esegue controlli dei tipi, test e build a ogni pull request e aggiornamento di `main`,
poi compila APK/AAB Android e l'app Release per simulatore iPhone/iPad su macOS. Gli artefatti sono scaricabili dalla
scheda Actions per 14 giorni. La build web viene compilata una volta e riutilizzata nelle due build native.

## Build PC, Android e iOS

La versione PC è la build web per browser desktop; Android e iOS includono lo stesso codice con Capacitor 8.5.3.

```sh
npm run build          # produzione web, directory build/
npm run apk:sync       # produzione web + sincronizzazione Android
npm run apk:release    # APK Release (Windows)
npm run android:bundle # AAB Release (Windows)
npm run ios:sync       # produzione web + sincronizzazione iOS, anche da Windows
npm run ios:open       # aprire il progetto in Xcode su Mac
```

Android richiede **JDK 21**, configurato tramite `JAVA_HOME`, e **Android SDK 36**. Il progetto non contiene percorsi
assoluti verso il computer dello sviluppatore. R8 ottimizza il codice e rimuove risorse inutilizzate nella Release;
le annotazioni e i metodi usati dal bridge Capacitor sono conservati. Cache e compilazione parallela Gradle sono attive.
Come nella configurazione Android iniziale, APK e AAB usano il certificato **debug**: per la distribuzione su Play Store
va configurata la propria chiave di firma. Non commettere chiavi o password.

Il progetto `ios/App/App.xcodeproj` usa Swift Package Manager e supporta **iPhone e iPad, da iOS 15**. La compilazione e
la firma Apple richiedono macOS/Xcode. La CI verifica la compilazione Release per simulatore senza certificati;
per installazione su dispositivi e App Store, scegliere il proprio team e la firma in Xcode.

## Ottimizzazioni senza ridurre il dettaglio

- Il podio riusa render bundle e texture view. Geometrie, pipeline e materiali procedurali restano pronti sul dispositivo
  GPU per 30 secondi tra due visite alla sala, poi il dispositivo viene distrutto e libera tutte le risorse. Tutti i
  passaggi di luce, ombre, riflessi, MSAA, pulviscolo e postproduzione restano attivi agli stessi preset.
- Le mipmap della cubemap si aggiornano sulla sola faccia modificata: **5/6 del lavoro di quella catena è eliminato**
  nei fotogrammi successivi al primo. Gli altri texel sono già identici e non devono essere riscritti.
- Le mesh mantengono gli stessi vertici, normali, UV e triangoli. La generazione evita array temporanei e calcoli
  ripetuti. Il logo Canvas riusa i buffer dei materiali, con gli stessi risultati numerici.
- Gli aggiornamenti Firestore deserializzano i soli documenti modificati; il testo degli scritti invariati non viene
  rianalizzato. Cache limitate e WeakMap evitano la crescita della memoria. HTML e filtri di sicurezza restano gli stessi.
- Le sezioni non visibili non vengono costruite durante la digitazione. Disegni e tratti già completati sono memoizzati;
  la ricerca degli archivi viene aggiornata con priorità inferiore alla digitazione.
- I font originali sono inclusi senza modifiche in `public/fonts`, insieme alle licenze OFL, agli URL e agli SHA-256:
  stessa tipografia anche offline, senza richieste a Google Fonts. `npm run fonts:update` aggiorna intenzionalmente i font.
- Le source map sono escluse dalla produzione web e dai pacchetti nativi. Per una build diagnostica si può impostare
  `GENERATE_SOURCEMAP=true` prima di `npm run build`; non cambia la qualità del rendering.

Per confrontare matematicamente geometrie e materiali con una copia iniziale:

```sh
npm run benchmark -- /percorso/alla/copia-iniziale
```

Il comando fallisce se geometrie o risultati dei materiali differiscono; i tempi riportati sono mediane locali,
non una previsione degli FPS su ogni dispositivo. I test del renderer controllano anche il riuso delle risorse e la
presenza di tutti i passaggi di rendering.

## Mobile, 3D e musica

Al primo accesso su telefono viene scelto il preset **Equilibrato**, mantenendo logo e titoli 3D.
Una preferenza già salvata resta valida. Il logo usa geometrie e risoluzione adatte al dispositivo;
logo e canvas animati sospendono i fotogrammi fuori schermo o quando la scheda è nascosta.
La preferenza di sistema per ridurre il movimento viene rispettata anche quando cambia durante la sessione.

Il logo 3D è disegnato direttamente in WebGPU (`src/logo3d/`: geometrie, shader WGSL, motore), senza three.js né WebGL:
un solo dispositivo condiviso, pipeline e ambiente prefiltrato creati una volta, la scena registrata in un render bundle,
MSAA 4× anche su telefono e ombre di contatto precalcolate in una texture. Mentre WebGPU si prepara compare un
caricamento animato. Dove WebGPU non c'è, l'adattatore è solo software o il dispositivo si perde più di due volte, la
stessa scena (stessa animazione, stesse luci e materiali calcolati in JavaScript) è disegnata in Canvas 2D
(`src/logo2d/`); il logo SVG resta solo se manca anche il Canvas 2D.

Il **podio del mese** è una sala da cerimonia in 3D a tutto schermo (WebGPU, `src/podium/`), fatta di mesh vere generate
all'avvio (`meshes.ts`): colonne doriche tornite con 20 scanalature e rastremazione, trabeazione, soffitto a cassettoni,
zoccolatura e cornici modanate, un finestrone ad arco con telaio e raggiera, stendardi con le pieghe e la coda a rondine,
coppe tornite con le anse. I gradini sono di marmo con la cima incorniciata d'oro, d'argento e di bronzo e il numero del
posto inciso con l'intarsio di metallo. Marmo venato (con le sue normali) e trama del tessuto sono texture procedurali
generate sulla GPU con le mip; i materiali usano la proiezione triplanare e il filtro anisotropo.
Dal finestrone entra la luce del sole (modalità chiara) o della luna con le stelle (modalità scura), che si muove di continuo
con le nuvole: la mappa d'ombra è presa sul piano del vetro lungo la luce e filtrata con PCSS (la penombra cresce con la
distanza dall'ostacolo), quindi le ombre di telaio, podio e coppe sono morbide e seguono l'astro a ogni fotogramma.
L'illuminazione globale usa una griglia di sonde aggiornate a turno con raggi fissi (nessun numero casuale: niente rumore né
sfarfallio sulle pareti) e i rimbalzi multipli; il pavimento ha il riflesso planare, le superfici lucide una cubemap della
sala aggiornata una faccia per fotogramma. MSAA 4× (sui computer i campioni si fondono pesati sulla luminanza, così i bordi
scuri davanti al finestrone non fanno gradini), fasci di luce nel pulviscolo a risoluzione ridotta, bloom e ACES. Contro lo
sfarfallio il lobo dei riflessi si allarga dove la normale cambia dentro il pixel (coppe, scanalature, modanature), bordi e
incisioni sono filtrati sull'impronta del pixel, granelli di pulviscolo e stelle non scendono sotto il pixel; i valori non
finiti si azzerano prima del bloom (un solo pixel NaN diventava un quadrato nero).
La sala è viva: la camera respira e segue il mouse, si trascina per girare attorno al podio, le coppe ruotano sui
piedistalli e al passaggio si sollevano e brillano, gli stendardi ondeggiano; un clic o un tocco su coppa o gradino apre
lo scritto. Le targhette dei vincitori restano HTML, proiettate sopra le coppe; sui telefoni la sala è un palco dentro la
pagina e i vincitori sono schede sotto di esso.

Il podio usa un suo dispositivo WebGPU (GPU ad alte prestazioni) e al primo avvio misura con una prova di qualche
decina di millisecondi la potenza di calcolo della scheda (ricordata per una settimana): ne esce una fascia
(bassa, media, alta, ultra) che sceglie ombre, riflessi, fasci, sonde e risoluzione massima, fino al supercampionamento
sulle schede più potenti; i telefoni restano al massimo nella fascia media. Il canvas ha sempre i pixel dello schermo e la
scena si disegna a una risoluzione propria che segue il tempo reale della GPU (marche temporali WebGPU, dove disponibili:
la parte fissa del lavoro e quella che cresce con i pixel si misurano separatamente), fino a tre quarti del fotogramma e
mai sotto il minimo della fascia; un passaggio finale la riporta ai pixel dello schermo con un filtro Catmull-Rom, a 1:1
esatto quando ci è vicina. Il ritmo è di circa 60 fotogrammi al secondo su un multiplo esatto del refresh (a 144 Hz, 72
regolari). Con `?podiohud` nell'indirizzo compare un riquadro con fascia, potenza misurata, risoluzione della scena e dello
schermo e tempi; `?podiotier=low|medium|high|ultra` forza una fascia; `?podiot=20` ferma la sala a quell'istante (per i
confronti fotogramma per fotogramma). Per provarlo in locale senza accesso: `npm run preview:podium`, poi
`http://127.0.0.1:4175/?podiohud` (`&dark` per la notte).
Senza WebGPU, con il movimento ridotto, con il preset leggero o se la GPU dà errore resta il podio semplice.

### Sorpresa notturna nella sala

Solo in modalità scura, toccare i sei riquadri centrali del finestrone: prima i due nell'arco
interno, poi i due centrali, infine i due inferiori; per ogni coppia, sinistra e poi destra.
Toccare il vetro visibile, evitando le targhette e le coppe davanti. Un tocco fuori sequenza
ricomincia il conteggio; trascinamenti, scorrimenti e tocchi annullati non contano.
Al sesto tocco la luna si vela, la camera si avvicina alla navata sinistra e Glitchtrap, verde e
disturbato come in Help Wanted (bordi che bruciano, linee di scansione, frammenti di pixel attorno,
l'immagine che si strappa a ogni glitch), nascosto dietro una colonna, si sporge finché compare un
occhio viola, scivola fuori e avanza furtivo (una camminata vera, registrata in motion capture, che
passa al largo della colonna; le mani sciolte non entrano mai nel costume) con lo sguardo fisso sulla
camera; sopra l'angolo della pedana un faro si accende a fatica e lo prende in penombra, con la sua
ombra sul pavimento, mentre il suo bagliore verde illumina la colonna e il pavimento. Si ferma
girandosi verso chi guarda in un solo movimento e saluta
lentamente con la mano destra all'altezza degli occhi, accanto alla testa inclinata, le dita morbide;
poi richiama con le dita, respira, sposta il peso da un piede all'altro, muove la mano libera e
tamburella con le dita, ha qualche scatto improvviso della testa (le orecchie lo seguono come molle) e
torna a salutare ogni quindici secondi. Dopo il primo saluto, a ogni glitch pesante si tende, si
spegne come un vecchio televisore e riappare in un altro punto della sala (dietro un angolo della
pedana o davanti, vicinissimo), con la camera che lo segue e il faro che si riaccende sopra di lui.
Con il movimento ridotto resta fermo con la mano alzata.
Cambio tema e uscita dalla pagina azzerano la sorpresa. Nei formati stretti la camera
scivola nella navata per mostrare la camminata e il saluto.

Geometria, texture e renderer della sorpresa vengono caricati al primo tocco corretto,
senza download o passaggi GPU aggiuntivi nella normale visita della sala. Il modello
condivide profondità, ombre, riflessi e composizione HDR del podio (il faro aggiunge una piccola
mappa d'ombra solo sua, solo mentre è acceso); lo scheletro viene posato
a ogni fotogramma (`src/podium/glitchtrapPose.ts`, sopra la camminata catturata in `walk.bin`) e la
mesh deformata sulla GPU. Le risorse
vengono liberate uscendo dalla scena. Nell'anteprima locale `&dark&podiosegreto` apre subito la
sorpresa e `&podiosegreto=9` la ferma a quell'istante (solo in sviluppo, solo di notte).
Provenienza, licenza e comandi di conversione: `public/glitchtrap/README.md`.

In **Opzioni → Musica e feedback** si può attivare **Musica di sottofondo** e regolare il volume separatamente dai bip.
Il brano allegato, Mii Channel (Plaza), è in `public/audio/mii-channel-plaza.mp3` e viene riprodotto in loop.
La musica è inizialmente spenta e il file non viene richiesto finché non è attivata.
Le impostazioni si salvano su questo dispositivo; al ritorno il browser può richiedere un tocco per riprendere l'audio.
Quando la scheda è nascosta la riproduzione si ferma e riprende al ritorno, se ancora attivata.
Le Opzioni sono disponibili anche prima dell'accesso.

## Effetti sonori

Tutti i suoni passano da un unico mixer Web Audio (`src/sound.ts`), con un limitatore in fondo alla catena:

| Suono | Quando | File |
| --- | --- | --- |
| Klick | passando col mouse su qualcosa di interattivo; su telefono al tocco | `public/audio/klick.wav` |
| Enter & Back | cambiando sezione: i due click salgono andando avanti nel menu, scendono tornando indietro | `nav-enter.wav`, `nav-back.wav` |
| Loading | tra il sito e il gioco segreto, dopo l'ultimo tocco sul logo: la barra segue nota per nota il suono | `loading.mp3` |
| Jingle | durante la presentazione del primo accesso | `intro.mp3` |

Il tick al passaggio è il suono più basso del mix (si sente spesso), il cambio di sezione sta un gradino sopra, caricamento
e jingle sono momenti e stanno davanti. Mentre suonano loro, la musica di sottofondo si abbassa e poi risale da sola.
In **Opzioni → Musica e feedback** si possono spegnere gli **Effetti sonori** e regolarne il volume; i browser li fanno
partire solo dopo il primo tocco o clic sulla pagina.

I file in `public/audio` sono ricavati dagli originali con `npm run audio:build -- <cartella con gli originali>` (serve
ffmpeg): toglie i silenzi iniziali, porta i picchi a -1 dBFS e il jingle a -16 LUFS, e crea la versione "indietro" del
suono di navigazione invertendo i due click. Gli originali non vengono modificati.

## Presentazione del primo accesso

Al primo accesso lo schermo è buio: c'è solo un pulsante 3D acceso dal suo LED. Premuto, la luce si propaga sulla scheda
e parte un film di 15 secondi a tempo col jingle: dall'alto si vede l'icona del sito come una targa smaltata con la C in
rilievo, il titolo si alza dalla targa, la camera vola radente tra le stazioni (Scrivi, Conserva, Emergi; per chi valuta:
Leggi, Vota, Premia), ognuna una parola in piedi su un chip con la spiegazione incisa sul fronte, poi il tuffo nel logo e
il drop con il saluto.

La camera non sta mai ferma. La regia è fatta di inquadrature vive (orbitano attorno alla parola, scivolano in avanti, si
avvicinano piano) e ogni passaggio fonde due inquadrature mentre entrambe si muovono (`direct` e `glide` in
`src/tour/motion.ts`): si parte decisi e si arriva con una lunga coda morbida, conservando lo slancio del viaggio, senza
frenate davanti alle scritte. Sopra c'è l'inerzia di una camera vera (un sistema del secondo ordine: piccolo sorpasso e
assestamento), il tremolio della mano, l'inclinazione nelle virate e le scosse sui colpi del brano; nei passaggi veloci il
fotogramma precedente lascia una scia, come l'otturatore aperto di una cinepresa.

Le lettere sono di gelatina: si posano schiacciandosi, poi a ogni battito del brano (griglia di 0,3884 s misurata sul file,
in fase con il drop) dondolano attorno al proprio piede, si schiacciano e si allargano, con l'onda che attraversa la parola;
sotto c'è un'oscillazione lenta che non si spegne mai. Anche i titoli del tour guidato ondeggiano.
La ghiera satinata del pulsante, il LED ambra e il vetro reagiscono al passaggio e alla pressione.
Pozze e fasci di luce, riflessi sulle superfici lucide; la profondità di campo separa le scritte nitide dalle piste,
dai chip e dalle luci fuori fuoco, e la polvere sospesa sopra la scheda diventa bokeh. Effetti della lente: strisce
anamorfiche e riflessi fantasma sulle luci forti, luce che filtra nei passaggi del brano, aberrazione cromatica sui colpi,
il segnale che salta sul drop, grana della pellicola e una vignetta che pulsa col ritmo.
Il film è disegnato su un canvas (`src/tour/film.ts`), senza WebGL: un buffer riutilizzato compone i piani ottici e lo
sfocato viene calcolato a risoluzione ridotta. Se il dispositivo arranca si riducono pixel, piste, strati, piani ottici e
polvere, e spariscono scia, aberrazione e salti; con il movimento ridotto la camera resta ferma, senza sfocato, impulsi né
effetti della lente, e le scritte si danno il cambio in dissolvenza.
Alla fine un nodo ambra vola sul primo elemento del sito e parte il tour guidato, che porta sezione per sezione sugli
elementi veri (`src/tour/Tour.tsx`). Si può saltare in qualunque momento (anche con Esc) e togliere l'audio.

Viene mostrata una volta per account su ogni dispositivo (`localStorage`, chiave `circuito:tour:<uid>`) e si può rivedere
dalle Opzioni: **Rivedi il filmato** (solo il film) e **Rivedi il tour** (solo il tour guidato).

Accanto al titolo di ogni sezione un **punto interrogativo** apre la guida breve di quella sezione: lo stesso tour
guidato, con i passi scritti in `src/tour/help.ts` (che cosa si fa lì e gli elementi che contano, diversi per chi
amministra). I passi il cui elemento non è sulla pagina si saltano; la guida si chiude dove si era. Il codice della presentazione e il jingle si scaricano solo per chi deve vederla.

Per rivedere e verificare il componente reale in locale, senza login o connessione a Firebase:

```sh
npm run preview:tour
```

Aprire `http://127.0.0.1:4174`. L'anteprima si ricompila quando si modifica il codice (ricaricare il browser).
Con `?board=0.5` lo **storyboard**: il film reso fotogramma per fotogramma a 60 fps, con le miniature ogni mezzo secondo e
il grafico della velocità della camera (serve a controllare che non si fermi mai e che i passaggi non diano strappi;
`&from=`, `&to=`, `&w=`, `&h=`, `&ts=` per finestra e dimensioni, `&calm`, `&low`, `&admin` come sopra). Con `?sheet` una
scheda dell'archivio e il lettore, per provare l'apertura e la chiusura del foglio (`&at=ms` ferma l'animazione in quel
punto, `&close` la chiusura, `&row` partendo da una riga della home).
I parametri `?admin=1`, `?calm=1`, `?low=1` e `?name=Alessandra` consentono di controllare ruoli, movimento ridotto,
qualità leggera e saluto; `?mode=auto` verifica anche il passaggio al tour su elementi dimostrativi.

## Pulsante "Scarica l'app Android"

Il pulsante compare nella schermata di accesso, nella barra laterale (desktop) e nella pagina Profilo (mobile).
Si nasconde da solo se l'app è già installata, su iPhone/iPad, e finché su Firebase non è configurato il link.

Il link all'APK **non è scritto nel codice**: viene letto da Firestore, quindi per pubblicare una nuova versione basta
cambiare un documento dalla console Firebase, senza rifare il deploy del sito.

### Configurazione su Firebase

1. **Metti il file .apk online** e copia il link https diretto al file. Scegli una delle strade:
   - *Firebase Storage* (richiede il piano Blaze, vedi nota sotto): Build → Storage → carica `il-circuito.apk` →
     clicca il file → copia il link "Access token".
   - *Firebase Hosting* (gratis): metti il file in `public/` e rilascia con `firebase deploy`; il link è
     `https://TUO-SITO.web.app/il-circuito.apk`.
   - *GitHub Releases* (gratis): crea una release e allega l'APK; il link "latest" è
     `https://github.com/hoffo1987/zibaldone_2/releases/latest/download/il-circuito.apk`.
2. **Crea il documento** su Firestore Database → Avvia raccolta:
   - ID raccolta: `app_config`
   - ID documento: `android`
   - campo `apkUrl` (string): il link del punto 1
   - campo `version` (string, facoltativo): per esempio `1.0.0`
3. **Regole**: la lettura pubblica di `app_config` (serve anche a chi non ha ancora fatto l'accesso) è già prevista
   in `firestore.rules`. Le modifiche fatte a mano dalla console non sono bloccate da `allow write: if false`.
4. **Aggiornare l'app in futuro**: carica il nuovo APK e cambia `apkUrl` (e `version`) nel documento `app_config/android`.

Nota sul piano: i bucket Storage nuovi (`…firebasestorage.app`, come quello di questo progetto) richiedono il piano
Blaze. Se non vuoi attivarlo, usa Hosting o GitHub Releases per il file: il pulsante funziona allo stesso modo.

Se il pulsante non appare: apri la console del browser (F12); se vedi l'avviso "APK: impossibile leggere
app_config/android" le regole del punto 3 non sono state pubblicate; se non vedi nulla controlla che il documento
si chiami esattamente `app_config` / `android` e che `apkUrl` inizi con `https://`.
