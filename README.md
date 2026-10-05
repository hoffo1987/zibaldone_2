# zibaldone_2 · Il Circuito
Created with CodeSandbox

## Regole di sicurezza di Firestore (`firestore.rules`)

Il file `firestore.rules` contiene le regole definitive. Si incollano in Firebase → Firestore Database → Regole
(sostituendo tutto) e si preme Pubblica. Cosa garantiscono:

- **Progetti (`pensieri`)**: li legge, modifica ed elimina solo il proprietario. Il proprietario non può darsi un voto
  né mettere il segnalibro, né cambiare autore o proprietario.
- **Admin**: è admin solo chi ha un documento `admins/{UID}` creato a mano dalla console. L'admin legge tutti i progetti,
  assegna voti (0-5) e segnalibri, modifica ed elimina. La parola d'ordine dell'app è nel codice del sito, quindi da sola
  non protegge nulla: la barriera vera è quel documento.
- **Profili (`profili`)**: li vede chi ha fatto l'accesso (l'app legge tutta la raccolta per nomi e avatar), li scrive solo
  il proprietario, con campi e lunghezze controllati. L'email non è in questa raccolta.
- **`app_config`**: lettura pubblica (serve al pulsante APK), scrittura solo dalla console.
- Tutto il resto è negato.

### Diventare admin

1. Firebase → Authentication → Utenti: copia il tuo **UID utente**.
2. Firestore Database → Avvia raccolta `admins` → ID documento = il tuo UID → aggiungi un campo qualsiasi
   (per esempio `ok` di tipo boolean = true; Firestore non salva documenti senza campi).
3. Nell'app entra in modalità admin come hai sempre fatto (doppio clic sul logo + parola d'ordine).

Chi conosce la parola d'ordine ma non ha il documento `admins/{UID}` vede l'interfaccia admin ma non riceve alcun dato
(errore "Impossibile leggere i progetti").

### Provare le regole prima di pubblicarle

Nell'editor delle regole c'è il pulsante **Simulatore di regole**: prova una lettura di `pensieri/xyz` da utente non
autenticato (deve essere negata) e da utente autenticato con `userId` uguale al suo UID (consentita).

## Pulsante "Scarica l'app Android"

Il pulsante compare nella schermata di accesso (largo, con testo), come piccola icona nella barra in alto su mobile e
nella riga in basso della barra laterale su desktop, e come pulsante largo nella pagina Profilo (mobile).
Si nasconde da solo se l'app è già installata, su iPhone/iPad, e finché su Firebase non è configurato il link.

Il link all'APK **non è scritto nel codice**: viene letto da Firestore, quindi per pubblicare una nuova versione basta
cambiare un documento dalla console Firebase, senza rifare il deploy del sito.

### Configurazione su Firebase

1. **Metti il file .apk online** e copia il link https diretto al file. Scegli una delle strade:
   - *Firebase Storage* (richiede il piano Blaze, vedi nota sotto): Build → Storage → carica `il-circuito.apk` →
     clicca il file → copia il link "Access token".
   - *Firebase Hosting* (gratis): metti il file in una cartella pubblica e rilascia con `firebase deploy`; il link è
     `https://TUO-SITO.web.app/il-circuito.apk`.
   - *GitHub Releases* (gratis): crea una release e allega l'APK; il link "latest" è
     `https://github.com/hoffo1987/zibaldone_2/releases/latest/download/il-circuito.apk`.
2. **Crea il documento** su Firestore Database → Avvia raccolta:
   - ID raccolta: `app_config`
   - ID documento: `android`
   - campo `apkUrl` (string): il link del punto 1
   - campo `version` (string, facoltativo): per esempio `1.0.0`
3. **Regole**: la lettura pubblica di `app_config` è già prevista in `firestore.rules`.
4. **Aggiornare l'app in futuro**: carica il nuovo APK e cambia `apkUrl` (e `version`) nel documento `app_config/android`.

Nota sul piano: i bucket Storage nuovi (`…firebasestorage.app`, come quello di questo progetto) richiedono il piano
Blaze. Se non vuoi attivarlo, usa Hosting o GitHub Releases per il file: il pulsante funziona allo stesso modo.

Se il pulsante non appare: apri la console del browser (F12); se vedi l'avviso "APK: impossibile leggere
app_config/android" le regole non sono state pubblicate; se non vedi nulla controlla che il documento
si chiami esattamente `app_config` / `android` e che `apkUrl` inizi con `https://`.
