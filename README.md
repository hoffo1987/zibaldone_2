# zibaldone_2 · Il Circuito
Created with CodeSandbox

## Sviluppo e verifica

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
La workflow `Site checks` esegue controlli dei tipi, test e build a ogni pull request e aggiornamento di `main`.

## Mobile, 3D e musica

Al primo accesso su telefono viene scelto il preset **Equilibrato**, mantenendo logo e titoli 3D.
Una preferenza già salvata resta valida. Il logo usa geometrie e risoluzione adatte al dispositivo;
logo e canvas animati sospendono i fotogrammi fuori schermo o quando la scheda è nascosta.
La preferenza di sistema per ridurre il movimento viene rispettata anche quando cambia durante la sessione.

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

Al primo accesso parte un film di 15 secondi a tempo col jingle: il Circuito si accende, il titolo si alza dalla scheda,
la camera passa per le stazioni (Scrivi, Conserva, Emergi; per chi valuta: Leggi, Vota, Premia), poi il drop con il
saluto. Il film è disegnato su un solo canvas (`src/tour/film.ts`), senza WebGL, e si alleggerisce da solo se il
dispositivo arranca; con il movimento ridotto la camera resta ferma e le scritte si danno il cambio in dissolvenza.
Alla fine un nodo ambra vola sul primo elemento del sito e parte il tour guidato, che porta sezione per sezione sugli
elementi veri (`src/tour/Tour.tsx`). Si può saltare in qualunque momento (anche con Esc) e togliere l'audio.

Viene mostrata una volta per account su ogni dispositivo (`localStorage`, chiave `circuito:tour:<uid>`) e si può rivedere
da **Opzioni → Rivedi la presentazione**. Il codice della presentazione e il jingle si scaricano solo per chi deve vederla.

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
