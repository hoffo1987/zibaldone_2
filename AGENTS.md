# Regole del progetto Il Circuito

Queste istruzioni valgono per ogni AI, chat e collaboratore che lavora nel repository.

## Aggiornamenti e notifiche

- Ogni aggiornamento dell'app deve avere un riepilogo specifico in italiano in `release-notes.json`, nello stesso commit delle modifiche.
- Il file contiene direttamente `titolo` e `messaggio` dell'aggiornamento corrente: NON indicizzarlo per versione Android. La stessa versione può ricevere diversi aggiornamenti web.
- Scrivere 1–3 frasi brevi su cosa è cambiato per chi usa il sito. Evitare messaggi generici come «correzioni e miglioramenti» o il riutilizzo del riepilogo precedente.
- Esempio: «Diario e Scritti ora sono vicini nella barra mobile. I miei scritti si trova nel menu Altro.»
- Eseguire `npm run check:release-notes` prima del commit. La CI verifica che il riepilogo sia nuovo e blocca la pubblicazione di annunci mancanti, generici o riciclati.
- Le notifiche restano automatiche dopo controlli, build e conferma del deployment; non inviare annunci manuali aggiuntivi per lo stesso commit.
- Le notifiche di voto sono distinte dagli annunci di aggiornamento: non cancellarle quando si puliscono annunci ripetuti.

## Consegna e mobile

- Completare i controlli appropriati e fare sempre push su `main`, come richiesto dal proprietario.
- Su mobile mantenere l'ordine Home, Scrivi, Scritti, Altro. Scritti è una sezione unica: al suo interno si passa tra Diario e Scritti completi (su PC le due voci sono sotto Scritti nella barra laterale). I miei scritti è dentro Altro; per gli amministratori ci sono anche Podio e Autori.
- Verificare le modifiche di layout nell'app completa, compresi apertura, scorrimento e chiusura degli scritti; la sola anteprima della barra non basta.
