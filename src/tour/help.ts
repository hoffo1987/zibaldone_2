// ===== LA GUIDA DI OGNI SEZIONE =====
// Il punto interrogativo accanto al titolo di ogni sezione apre un giro breve, con lo stesso tour guidato della
// presentazione (Guide in Tour.tsx): prima che cosa si fa nella sezione, poi gli elementi che contano. Il bersaglio è un
// data-tour oppure, con «css:», un selettore: i passi il cui elemento non c'è (una lista vuota, un pulsante solo per gli
// amministratori) si saltano prima di partire.

export type Step = { tab: string; target: string; title: string; body: string };

const HEAD = "page-head";
const CARD = "css:.shell-main [data-doc]";

export const helpSteps = (tab: string, admin: boolean): Step[] => {
  const s = (target: string, title: string, body: string): Step => ({ tab, target, title, body });
  switch (tab) {
    case "home": return admin ? [
      s(HEAD, "Panoramica", "Il Circuito a colpo d’occhio: quanti scritti sono arrivati, chi scrive e quanti restano da valutare questo mese."),
      s("hero-actions", "Da dove partire", "Da qui vai dritto agli scritti ancora senza voto o al podio del mese."),
      s("css:.stat-card", "I numeri", "Ogni riquadro è anche una scorciatoia: toccalo per aprire l’elenco che conta."),
      s("bell", "Notifiche", "Gli annunci degli aggiornamenti e le scintille sui tuoi pensieri arrivano nella campanella."),
    ] : [
      s(HEAD, "Panoramica", "Il tuo Circuito a colpo d’occhio: i tuoi numeri, gli ultimi scritti e da dove ripartire."),
      s("hero-actions", "Comincia da qui", "Un tocco e sei sul foglio bianco. La bozza si salva da sola mentre scrivi."),
      s("css:.room-card", "Le due stanze", "Gli scritti completi partecipano al podio del mese; il diario si legge per intero, senza voti."),
      s("css:.stat-card", "I tuoi numeri", "Scritti, scritti del mese e parole: toccali per ritrovare i tuoi testi."),
      s("bell", "Notifiche", "Voti, scintille accese sui tuoi pensieri e pensieri nati dai tuoi: la campanella te lo dice."),
    ];
    case "write": return [
      s(HEAD, "Scrivi", "Qui nasce ogni pagina: scegli il tipo, scrivi o disegna, poi invia. La bozza si salva da sola."),
      s("css:.writing-picker", "Che cosa stai scrivendo", "Scritto completo: gli altri ne vedono un estratto e partecipa al podio. Pensiero del diario: si legge per intero, anonimo o firmato, senza voti."),
      s("editor-mode", "Scrivi o disegna", "Scrivi come su un quaderno, aggiungi foto, oppure passa a Disegno: penna, forme, colori e gomma."),
      s("save", "Invia", "Quando sei pronto, pubblica. Potrai sempre riaprirlo e modificarlo da I miei scritti."),
    ];
    case "diario": return [
      s(HEAD, "Diario", "Pensieri da leggere per intero, anonimi o firmati. Niente voti né classifiche: solo da leggere."),
      s("scritti-switch", "Diario e Scritti completi", "Le due stanze della sezione Scritti: da qui passi dall’una all’altra."),
      s("css:.diary-card", "Leggi e accendi", "Apri un pensiero. Se una frase ti colpisce, selezionala e accendi una scintilla: chi l’ha scritto la vedrà brillare, senza sapere chi sei. Al massimo cinque per pensiero."),
      s("css:.diary-card", "Rispondi con un pensiero", "Dalla stessa frase puoi anche scrivere un pensiero tuo: porterà con sé la citazione e il legame con l’originale."),
    ];
    case "altri": return [
      s(HEAD, "Scritti completi", "Gli scritti completi degli altri, in estratto e senza nomi né date. I migliori del mese salgono sul podio."),
      s("scritti-switch", "Diario e Scritti completi", "Da qui passi al Diario, dove i pensieri si leggono per intero."),
      s("staffetta", "La staffetta", "Ogni mese una frase dal podio diventa l’incipit: scrivi il capitolo dopo. Resta anonimo; i capitoli scelti entrano per intero, con il nome, nel racconto del Circuito."),
      s(CARD, "Leggi un estratto", "Apri uno scritto per leggerne l’inizio: il testo integrale lo vedono solo l’autore e l’amministratore."),
    ];
    case "read": return [
      s(HEAD, "Scritti completi", "Gli scritti del mese arrivano con l’autore nascosto: leggi, vota e solo dopo scopri chi ha scritto."),
      s("scritti-switch", "Diario e Scritti completi", "Da qui passi al Diario: lì vedi sempre chi ha scritto, anche i pensieri anonimi."),
      s("filters", "Filtri", "Cerca, ordina, scegli il mese e lo stato della lettura, mostra i segnalati o quelli ancora da valutare."),
      s("staffetta", "La staffetta", "Dalla regia scegli la frase dell’incipit tra gli scritti svelati del podio e, a fine mese, i capitoli del racconto: si pubblicano dal 3, con il podio."),
      s(CARD, "Leggi e valuta", "Apri uno scritto: da mezza a cinque stelle, una nota privata, poi svela l’autore. Dopo lo svelamento il voto è definitivo."),
    ];
    case "my_pages": return [
      s(HEAD, "I miei scritti", "Tutto quello che hai scritto, in un posto solo: ritrovalo, riaprilo, modificalo."),
      s("filters", "Cerca e filtra", "Per parola, tipo, mese o ordine. Seleziona per eliminare più scritti insieme."),
      s("css:.sc-mie", "Le tue scintille", "Le frasi accese dagli altri sui tuoi pensieri e quelle che hai acceso tu sui loro. Tocca una frase per riaprire il pensiero."),
      s(CARD, "I tuoi scritti", "Apri uno scritto per rileggerlo o modificarlo. Dopo la lettura dell’amministratore vedrai anche il voto."),
    ];
    case "podio": return admin ? [
      s(HEAD, "Podio del mese", "I tre scritti completi con il voto più alto del mese salgono qui. Gli altri lo vedono coperto da un telo fino alla presentazione, dal 3 al 5."),
      s("css:.pd-bar", "Il mese", "Scegli il mese: la pista mostra quanto ne è passato e quanti scritti restano da valutare."),
    ] : [
      s(HEAD, "Podio del mese", "Qui salgono i migliori scritti completi del mese. Fino ai giorni della presentazione il podio resta coperto da un telo: le scritte nella sala dicono quando si scopre."),
    ];
    case "authors": return [
      s(HEAD, "Autori", "Le persone del Circuito: chi scrive, quanto scrive e con che media."),
      s("css:.au-card", "Una persona", "Tocca la scheda per vedere i suoi scritti completi; tocca la foto per aprire il suo profilo."),
    ];
    case "profile": return [
      s(HEAD, "Il tuo profilo", "Come ti vedono gli altri: nome, handle, colore del banner, stato e due righe su di te."),
    ];
    default: return [];
  }
};
