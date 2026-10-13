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
