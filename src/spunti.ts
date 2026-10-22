// ===== GLI SPUNTI DEL DIARIO =====
// Per chi apre il diario e non sa da dove cominciare: una domanda, una traccia o mezza frase da finire. Mai un testo
// già scritto: lo spunto apre la porta, la pagina resta di chi scrive.
// I set sono temi diversi (la giornata, i ricordi, le persone…) e dentro ogni set le forme si alternano. Alcuni spunti
// valgono solo in certi momenti ([sera] la sera, [autunno] in autunno…): a mezzogiorno nessuno si sente chiedere
// com'è finita la giornata. Chi scrive vede spunti sempre nuovi finché il set non è finito (si ricordano quelli già
// visti su questo dispositivo) e una volta al giorno c'è lo spunto di oggi, lo stesso per tutto il Circuito.
// Niente forme al maschile o al femminile per chi scrive: le domande si rivolgono a tutti allo stesso modo. E il diario
// lo leggono tutti: gli spunti chiedono gesti, dettagli, sensazioni, mai nomi o indirizzi.

export type Momento = "mattina" | "pomeriggio" | "sera" | "notte" | "weekend" | "lunedi" | "venerdi" | "autunno" | "inverno" | "primavera" | "estate";
export const MOMENTI: Momento[] = ["mattina", "pomeriggio", "sera", "notte", "weekend", "lunedi", "venerdi", "autunno", "inverno", "primavera", "estate"];

export type SetId = "oggi" | "ricordi" | "persone" | "dentro" | "piccole" | "immagina" | "domani" | "grandi" | "intorno" | "incipit";
// domanda: finisce con un punto interrogativo; incipit: mezza frase da finire (…); traccia: un invito, senza domanda
export type Tipo = "domanda" | "incipit" | "traccia";
export type Spunto = { id: string; set: SetId; text: string; tipo: Tipo; when: Momento[] };
type Raw = { id: SetId; name: string; blurb: string; list: string[] };

const RAW: Raw[] = [
  { id: "oggi", name: "Oggi", blurb: "La giornata appena passata, vista da vicino.", list: [
    "Se oggi avesse un titolo, quale sarebbe?",
    "Qual è stato il momento più lento della giornata? E il più veloce?",
    "Oggi, per un attimo, ho pensato che…",
    "Se potessi tenere un solo minuto di oggi, quale sceglieresti?",
    "C’è una frase, sentita oggi, che ti è rimasta in testa?",
    "La cosa più strana di oggi è stata…",
    "Qual è stata la parte migliore della giornata, anche se piccola?",
    "[sera,notte] Com’è finita la giornata, rispetto a come era cominciata?",
    "[mattina] Qual è stato il primo pensiero di stamattina?",
    "Se oggi fosse un colore, quale sarebbe? Perché proprio quello?",
    "Oggi avrei voluto dire…",
    "Che cosa hai rimandato oggi? E perché proprio quello?",
    "C’è stato un momento, oggi, in cui il tempo sembrava fermarsi?",
    "[weekend] Che cosa ha di diverso questo giorno, rispetto agli altri della settimana?",
    "[lunedi] Che cosa ti aspetti da questa settimana appena cominciata?",
    "[venerdi] Se questa settimana fosse un film, come finirebbe?",
    "Che cosa, oggi, ti ha fatto sorridere senza un vero motivo?",
    "[notte] Quale pensiero è ancora acceso, a quest’ora?",
    "[pomeriggio] Com’è andata la mattinata? E che cosa ti aspetta adesso?",
    "Una cosa che ho imparato oggi, e che non era scritta su nessun libro, è…",
  ] },
  { id: "ricordi", name: "Ricordi", blurb: "Una porta che si apre all’indietro.", list: [
    "Qual è il primo ricordo che ti viene in mente se pensi alla cucina di casa?",
    "Mi ricordo ancora il giorno in cui…",
    "C’è un odore che ti riporta subito indietro nel tempo? Dove ti porta?",
    "Qual è un gioco dell’infanzia che rifaresti anche adesso?",
    "Quale estate ricordi meglio delle altre, e perché proprio quella?",
    "C’è un oggetto che conservi da anni senza sapere bene perché?",
    "Ricordo una volta in cui ho avuto davvero coraggio…",
    "Che cosa diresti a chi eri un anno fa?",
    "C’è una canzone legata a un momento preciso della tua vita? Che momento è?",
    "Avevi un nascondiglio segreto, una volta? Com’era?",
    "Il ricordo più buffo che ho della scuola è…",
    "C’è un giorno che vorresti rivivere identico, senza cambiare niente?",
    "Quale regalo ti è rimasto nel cuore, anche se non costava niente?",
    "Non l’ho mai raccontato, ma una volta…",
    "Ti ricordi un primo giorno: di scuola, in una città nuova, in un gruppo? Com’è andato?",
    "Quale storia di famiglia hai sentito così tante volte da sembrarti un ricordo tuo?",
    "Una cosa che facevo sempre e che ho smesso di fare è…",
    "[autunno] Che cosa ti ricorda l’odore dell’autunno?",
    "[inverno] Qual è il tuo ricordo d’inverno più caldo?",
  ] },
  { id: "persone", name: "Persone", blurb: "Senza fare nomi: bastano un gesto, una voce, un dettaglio.", list: [
    "Pensa a qualcuno che ti fa sempre ridere. Che cosa fa, esattamente?",
    "C’è qualcuno a cui vorresti dire grazie e non l’hai ancora fatto? Per che cosa?",
    "Una cosa che ho imparato da qualcuno, senza che se ne accorgesse, è…",
    "Qual è il complimento più bello che hai ricevuto?",
    "Descrivi le mani di qualcuno a cui vuoi bene. Che cosa raccontano?",
    "Che cosa rende vera un’amicizia, secondo te?",
    "C’è una persona conosciuta da poco che ti ha colpito? Che cosa ti ha colpito?",
    "Se potessi passare un pomeriggio con chiunque, del passato o del presente, chi sceglieresti?",
    "La cosa che mi manca di più di qualcuno che vedo poco è…",
    "Quando qualcuno ti ascolta davvero, come te ne accorgi?",
    "Ti è mai capitato di cambiare idea su una persona? Che cosa è successo?",
    "C’è un gesto gentile di una persona sconosciuta che ricordi ancora?",
    "Vorrei che qualcuno, almeno una volta, mi chiedesse…",
    "Che cosa sa di te la persona che ti conosce meglio, e che gli altri non sanno?",
    "Riesci a stare in silenzio con qualcuno senza imbarazzo? Com’è quel silenzio?",
    "Che cosa hai preso, senza accorgertene, dalla tua famiglia: un gesto, una parola, un modo di ridere?",
    "Una volta ho litigato con qualcuno, ma alla fine…",
    "Che cosa vorresti che gli altri capissero di te al primo sguardo?",
  ] },
  { id: "dentro", name: "Dentro di te", blurb: "Emozioni e pensieri che si sentono prima di capirli.", list: [
    "Come stai, davvero? Non la risposta veloce: quella lunga.",
    "In questo periodo mi sento…",
    "C’è un’emozione che fai fatica a nominare? Prova a descriverla: che forma ha, dove la senti?",
    "Che cosa ti fa sentire al sicuro?",
    "Qual è una paura che hai superato, o che stai imparando a guardare in faccia?",
    "La cosa che mi fa arrabbiare più di tutte è…",
    "Quando ti senti fuori posto, che cosa ti aiuta a ritrovarti?",
    "Quale piccola vittoria, di recente, meritava un applauso che nessuno ti ha fatto?",
    "Se il tuo umore di oggi fosse il tempo che fa fuori, che tempo farebbe?",
    "Una cosa che non dico quasi mai ad alta voce è…",
    "Che cosa ti dà energia, e che cosa te la porta via?",
    "Quand’è stata l’ultima volta che hai pianto dal ridere?",
    "Di che cosa avresti bisogno, adesso, che nessuno ti ha ancora dato?",
    "Ultimamente penso spesso a…",
    "C’è una preoccupazione che, scritta qui, potrebbe pesare un po’ meno?",
    "In quale momento della giornata ti riconosci di più?",
    "Ci sono giorni in cui tutto mi sembra più leggero, e altri in cui…",
    "Che cosa vorresti perdonarti?",
  ] },
  { id: "piccole", name: "Piccole cose", blurb: "I dettagli che di solito non trovano spazio.", list: [
    "Qual è il suono più bello che hai sentito di recente?",
    "Guarda la stanza in cui ti trovi come se fosse la prima volta. Che cosa noti?",
    "Una piccola cosa che mi mette sempre di buonumore è…",
    "Che sapore ha la tua merenda preferita? Raccontalo a chi non l’ha mai assaggiata.",
    "C’è un oggetto sulla tua scrivania che racconta qualcosa di te?",
    "Qual è la parola che ti piace di più, solo per come suona?",
    "Il momento più bello della mia settimana dura pochi minuti, ed è quando…",
    "Che cosa c’è nel tuo zaino, in questo momento? Che storia racconta?",
    "Com’è la luce, adesso, intorno a te?",
    "Qual è l’ultima cosa che ti ha fatto dire «che bello»?",
    "Se potessi chiudere un profumo in un barattolo, quale sceglieresti?",
    "C’è un piccolo rito di tutti i giorni a cui non rinunceresti mai?",
    "La cosa più bella che ho visto per strada, ultimamente, è…",
    "Che cosa ti piace fare con le mani?",
    "Che cosa cambia, dentro di te, quando piove?",
    "Quale cibo sa di casa, per te?",
    "Pensa a tre cose belle di oggi, anche minuscole. Poi scegline una e raccontala.",
    "[sera,notte] Quali sono i rumori di casa, la sera?",
    "Il posto più comodo del mondo, per me, è…",
  ] },
  { id: "immagina", name: "E se…", blurb: "Una domanda impossibile, una risposta tutta tua.", list: [
    "E se per un giorno potessi diventare invisibile? Dove andresti?",
    "Se incontrassi la versione di te di sei anni, che cosa ti chiederebbe?",
    "Se il posto in cui vivi avesse un superpotere, quale sarebbe?",
    "Se potessi aggiungere una materia a scuola, quale inventeresti?",
    "Se un giorno, al risveglio, tutto il mondo fosse in silenzio, io…",
    "Se potessi vivere una settimana dentro un libro, un film o un videogioco, quale sceglieresti?",
    "Se gli animali potessero parlare, quale vorresti ascoltare per primo?",
    "Immagina una porta mai notata, in un posto che conosci benissimo. Dove si apre?",
    "Se potessi fermare il tempo per un’ora, che cosa faresti?",
    "Se i pensieri facessero rumore, che suono farebbero i tuoi in questo momento?",
    "Se potessi cambiare una sola regola del mondo, quale sarebbe?",
    "Se dovessi affidare un messaggio a una bottiglia, che cosa scriveresti?",
    "Se potessi imparare una cosa all’istante, senza fatica, che cosa sceglieresti?",
    "Se domani arrivasse una lettera senza mittente indirizzata a me, direbbe…",
    "Se la tua vita avesse una colonna sonora, quale canzone partirebbe adesso?",
    "E se per un giorno intero tutti dicessero soltanto la verità?",
    "Se potessi diventare un elemento della natura per un giorno, quale sceglieresti?",
    "Se domani potessi svegliarmi in qualunque posto del mondo, sceglierei…",
  ] },
  { id: "domani", name: "Domani", blurb: "Sogni, progetti e attese: quello che deve ancora arrivare.", list: [
    "Che cosa vorresti saper fare tra cinque anni?",
    "Un giorno mi piacerebbe…",
    "Qual è un sogno che non hai mai raccontato a nessuno?",
    "Che cosa ti aspetti da questo mese?",
    "Se scrivessi una lettera da aprire tra dieci anni, che cosa ci metteresti dentro?",
    "Che cosa ti fa paura del futuro, e che cosa ti incuriosisce?",
    "L’anno prossimo, a quest’ora, spero di…",
    "Che tipo di persona vorresti diventare?",
    "Qual è il primo passo, anche minuscolo, verso qualcosa che desideri?",
    "Che cosa vorresti fare almeno una volta nella vita?",
    "[sera,notte] Che cosa vorresti che succedesse domani?",
    "[mattina] Che cosa renderebbe oggi una bella giornata?",
    "Se il futuro fosse un luogo, che aspetto avrebbe?",
    "Una cosa che voglio smettere di rimandare è…",
    "Quale lavoro faresti se nessuno potesse giudicarti?",
    "Tra tanti anni, ripensando a questo periodo, credo che ricorderò…",
    "[autunno] Che cosa vorresti combinare prima che arrivi l’inverno?",
    "[estate] Che cosa vuoi che ti resti di quest’estate?",
    "[primavera] Che cosa vorresti far sbocciare, in questa primavera?",
    "[inverno] Che cosa ti aiuta ad aspettare la primavera?",
  ] },
  { id: "grandi", name: "Grandi domande", blurb: "Quelle che non hanno una risposta giusta, solo la tua.", list: [
    "Che cosa significa, per te, libertà?",
    "Conta di più la sincerità o la gentilezza?",
    "Che cosa rende una giornata «riuscita»?",
    "Le persone possono cambiare davvero?",
    "Secondo me, la felicità…",
    "Che cosa vorresti che il mondo sapesse della tua generazione?",
    "C’è una regola che rispetti ma che non ti convince? Perché?",
    "Che cosa c’è di unico in te, che non trovi in nessun altro?",
    "Ha senso fare qualcosa di bello anche se nessuno lo vedrà mai?",
    "Quand’è giusto arrendersi? E quando invece no?",
    "Qual è la domanda a cui vorresti una risposta più di ogni altra?",
    "Il coraggio, per me, è…",
    "La tecnologia ci avvicina o ci allontana?",
    "Che cosa vuol dire crescere?",
    "Si può sentire la solitudine anche in mezzo a tanta gente?",
    "Una cosa che credo vera, anche se tanti non sono d’accordo, è…",
    "Che cosa resterà di te nelle persone che incontri?",
    "Che cosa vuol dire, per te, «casa»?",
    "Sbagliare è sempre una perdita di tempo?",
  ] },
  { id: "intorno", name: "Il mondo intorno", blurb: "Scuola, strade, stagioni: quello che ti circonda.", list: [
    "Che cosa vedi, di solito, sulla strada per la scuola? E che cosa non hai mai notato?",
    "Se potessi cambiare una cosa della tua scuola, quale sarebbe?",
    "C’è un posto, vicino a casa, dove stai bene? Descrivilo senza dire dove si trova.",
    "Una notizia che ultimamente mi ha fatto pensare è…",
    "Che cosa ti insegna la natura, quando ti fermi a guardarla?",
    "[autunno] Che cosa cambia intorno a te in autunno? E che cosa cambia dentro?",
    "[inverno] Che cosa ti fa venire voglia di fare, il freddo?",
    "[primavera] Qual è il primo segno di primavera che hai notato?",
    "[estate] Che cosa ha l’estate che nessun’altra stagione ha?",
    "Se la tua classe fosse un’orchestra, che strumento suoneresti?",
    "Che cosa vorresti proteggere del mondo, per chi verrà dopo?",
    "Qual è il rumore di fondo delle tue giornate?",
    "La materia che mi fa perdere la cognizione del tempo è…",
    "Che cosa hai visto, ultimamente, che ti ha fatto pensare «non è giusto»?",
    "Se dovessi mostrare il tuo posto preferito a chi arriva da lontano, che cosa faresti vedere per primo?",
    "Fuori dalla finestra, in questo momento, c’è…",
    "Che cosa hai imparato quest’anno, fuori dai libri?",
    "[notte] Com’è il cielo stanotte? E com’è il silenzio?",
    "Se il mondo potesse ascoltarti per un minuto, che cosa gli diresti?",
  ] },
  { id: "incipit", name: "Comincia così", blurb: "Mezza frase: l’altra metà la scrivi tu.", list: [
    "Non so bene da dove cominciare, quindi comincio da…",
    "Oggi ho capito che…",
    "In tutta sincerità,…",
    "Nessuno lo sa, ma…",
    "C’è una cosa che mi gira in testa da giorni:…",
    "Vorrei scrivere di una cosa piccola, che però…",
    "La verità è che…",
    "Ieri sera, prima di dormire, pensavo a…",
    "Se questa pagina potesse ascoltarmi, le direi che…",
    "Ho sempre pensato che…",
    "Mi piacerebbe che qualcuno sapesse che…",
    "Tutto è cominciato quando…",
    "Di solito non ne parlo, però…",
    "Stamattina, appena ho aperto gli occhi, ho pensato…",
    "Caro qualcuno, questa lettera non la leggerai mai, ma…",
    "Se potessi riavvolgere il nastro, tornerei a…",
    "Sto imparando a…",
    "Adesso, proprio adesso, sento…",
    "Non me l’aspettavo, ma…",
    "La prima cosa che mi viene in mente è…",
  ] },
];

export type SpuntiSet = { id: SetId; name: string; blurb: string };
export const SETS: SpuntiSet[] = RAW.map(({ id, name, blurb }) => ({ id, name, blurb }));
export const setOf = (id: SetId) => SETS.find((s) => s.id === id)!;

// un'impronta corta del testo: resta la stessa se si riordinano i set o se ne aggiungono altri
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export const tipoOf = (text: string): Tipo => (text.endsWith("…") ? "incipit" : text.includes("?") ? "domanda" : "traccia");
export const parse = (set: SetId, line: string): Spunto => {
  const m = /^\[([a-z,]+)\]\s*/.exec(line);
  const text = m ? line.slice(m[0].length) : line;
  return { id: `${set}-${hash(text)}`, set, text, tipo: tipoOf(text), when: m ? (m[1].split(",") as Momento[]) : [] };
};
export const ALL: Spunto[] = RAW.flatMap((r) => r.list.map((l) => parse(r.id, l)));
export const TIPO_LABEL: Record<Tipo, string> = { domanda: "Domanda", incipit: "Inizio di frase", traccia: "Traccia" };

// il momento di adesso: fascia del giorno, giorni particolari della settimana, stagione
export const momentiOf = (d: Date): Momento[] => {
  const h = d.getHours(), wd = d.getDay(), m = d.getMonth();
  const out: Momento[] = [h >= 5 && h < 12 ? "mattina" : h >= 12 && h < 18 ? "pomeriggio" : h >= 18 && h < 23 ? "sera" : "notte"];
  if (wd === 0 || wd === 6) out.push("weekend");
  if (wd === 1) out.push("lunedi");
  if (wd === 5) out.push("venerdi");
  out.push(m >= 2 && m <= 4 ? "primavera" : m >= 5 && m <= 7 ? "estate" : m >= 8 && m <= 10 ? "autunno" : "inverno");
  return out;
};
// uno spunto senza momento va sempre bene; uno con dei momenti, se adesso è almeno uno di quelli
export const fits = (s: Spunto, now: Momento[]) => !s.when.length || s.when.some((w) => now.includes(w));

export type Scelta = SetId | "tutti";
type DrawOpts = { set: Scelta; now: Date; seen: string[]; prev?: Spunto | null; rnd?: () => number };
// Il prossimo spunto: mai quello appena visto, prima quelli mai visti su questo dispositivo (finiti quelli, i visti da
// più tempo). Quelli legati a questo momento escono più spesso; nel mix si evita di restare sullo stesso tema e si
// alternano domande e frasi da finire.
export const draw = ({ set, now, seen, prev, rnd = Math.random }: DrawOpts): Spunto => {
  const at = momentiOf(now);
  const all = ALL.filter((s) => (set === "tutti" || s.set === set) && fits(s, at));
  const pool = all.filter((s) => s.id !== prev?.id);
  const fresh = pool.filter((s) => !seen.includes(s.id));
  let cand = fresh;
  if (!cand.length) {
    // tutti già visti: si ripescano quelli visti da più tempo (la metà più vecchia)
    const old = pool.slice().sort((a, b) => seen.lastIndexOf(a.id) - seen.lastIndexOf(b.id));
    cand = old.slice(0, Math.max(1, Math.ceil(old.length / 2)));
  }
  if (!cand.length) return all[0] || ALL[0];
  const w = cand.map((s) => (s.when.length ? 2.2 : 1) * (set === "tutti" && prev && s.set === prev.set ? 0.25 : 1) * (prev && s.tipo === prev.tipo ? 0.6 : 1));
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r < 0) return cand[i]; }
  return cand[cand.length - 1];
};

// Lo spunto di oggi: lo stesso per tutti, cambia a mezzanotte. Si scorre una permutazione fissa degli spunti che vanno
// bene in ogni momento, così non torna lo stesso prima di averli visti tutti.
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const DAILY = (() => {
  const pool = ALL.filter((s) => !s.when.length), r = rng(20261022);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool;
})();
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dailyOf = (d: Date): Spunto => DAILY[Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % DAILY.length];

// Due parole sotto lo spunto: incoraggiano, non spiegano. Lo spunto di oggi ha la sua.
const CHEERS = [
  "Non deve essere perfetto: deve essere tuo.",
  "Bastano tre righe. Se poi diventano trenta, meglio.",
  "Scrivi come se parlassi a qualcuno di cui ti fidi.",
  "Nessun voto, nessuna classifica: solo la tua pagina.",
  "Lo spunto è una porta: la strada la scegli tu.",
  "Se ti blocchi, scrivi la prima parola che arriva. Poi la seconda.",
  "Non serve avere tutto chiaro per cominciare.",
  "Puoi sempre cambiare strada a metà pagina.",
];
export const TODAY_CHEER = "Lo stesso spunto, oggi, per tutto il Circuito.";
export const cheerAfter = (prev: string, rnd = Math.random) => { const c = CHEERS.filter((x) => x !== prev); return c[Math.floor(rnd() * c.length)]; };
// che cosa succede sul foglio: lo si dice prima, sotto i pulsanti
export const USE_NOTE: Record<Tipo, string> = {
  domanda: "La domanda va sul foglio in corsivo: rispondi sotto, poi tienila o cancellala.",
  traccia: "La traccia va sul foglio in corsivo: scrivi sotto, poi tienila o cancellala.",
  incipit: "La frase va sul foglio: continua tu da dove si ferma.",
};

// Che cosa si scrive sul foglio: la domanda (o la traccia) in corsivo e una riga vuota sotto per rispondere; la mezza
// frase senza i puntini, con uno spazio dopo, pronta da continuare.
export const paperText = (s: Spunto) => (s.tipo === "incipit" ? `${s.text.replace(/…$/, "")} ` : s.text);
// lo spunto è ancora sul foglio? (testo semplice del foglio). Se chi scrive l'ha cancellato, anche solo in parte, lo
// si può rimettere
const flat = (t: string) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
export const onSheet = (text: string, s: Spunto) => flat(text).includes(flat(paperText(s)));

// memoria di questo dispositivo: gli spunti già visti (i più recenti in fondo), se il pannello è aperto, l'ultimo
// giorno in cui si è scritto dallo spunto di oggi
export type Memo = { seen: string[]; open: boolean; daily?: string };
const KEY = "circuito:spunti:";
export const SEEN_MAX = 150;
export const loadMemo = (uid: string): Memo => {
  try { const m = JSON.parse(localStorage.getItem(KEY + uid) || "null"); if (m && Array.isArray(m.seen)) return { seen: m.seen.filter((x: any) => typeof x === "string").slice(-SEEN_MAX), open: m.open !== false, daily: typeof m.daily === "string" ? m.daily : undefined }; } catch {}
  return { seen: [], open: true };
};
export const saveMemo = (uid: string, m: Memo) => { try { localStorage.setItem(KEY + uid, JSON.stringify({ ...m, seen: m.seen.slice(-SEEN_MAX) })); } catch {} };
export const remember = (seen: string[], id: string) => [...seen.filter((x) => x !== id), id].slice(-SEEN_MAX);
