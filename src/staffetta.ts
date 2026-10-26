// ===== LA STAFFETTA =====
// Ogni mese una frase presa da uno scritto del podio diventa l'incipit del mese: tutti possono scriverne il capitolo
// successivo, come uno scritto completo (anonimo, in gara per il podio come gli altri). A fine mese l'admin sceglie i
// capitoli migliori e, dal 3 del mese dopo (quando si svela il podio), il Circuito li mostra uniti in un racconto
// collettivo che cresce di mese in mese. Dati (le regole sono in firestore.rules):
//   staffetta/{mese}                    l'incipit pubblico: { frase, creato }, nient'altro
//   staffetta/{mese}/riservato/fonte    { id } dello scritto da cui viene la frase: solo admin
//   staffetta/{mese}/riservato/scelta   { ids } i capitoli scelti, in ordine: solo admin
//   staffetta/{mese}/capitoli/{id}      i capitoli pubblicati, per intero e con il nome: { ordine, title, content, firma, autoreId }
//   pensieri/{id}.staffetta = mese      il legame del capitolo, copiato in testi/{id} accanto all'estratto
import { staffettaOf } from "./testi";

export { staffettaOf };
export type Incipit = { mese: string; frase: string; creato: number };
export type CapitoloPub = { id: string; ordine: number; title: string; content: string; firma: string; autoreId: string };
export type Giro = Incipit & { giro: number; capitoli: CapitoloPub[] };
export const FRASE_MIN = 3, FRASE_MAX = 280, SCELTI_MAX = 30;
export const MESE_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (m: string) => { const [y, mo] = m.split("-").map(Number); return { y, mo }; };
// il mese dell'ora locale: un capitolo si scrive nel mese in cui lo vede chi scrive (le regole lasciano due ore di margine)
export const meseDi = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const meseDopo = (m: string) => { const { y, mo } = parts(m); return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`; };
export const mesePrima = (m: string) => { const { y, mo } = parts(m); return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`; };
// l'ultimo giorno in cui si scrive il capitolo e il giorno in cui il racconto si svela: il 3 del mese dopo, come il podio
export const ultimoGiorno = (m: string) => { const { y, mo } = parts(m); return new Date(y, mo, 0); };
export const svelamentoDi = (m: string) => { const { y, mo } = parts(m); return new Date(y, mo, 3); };
export const svelato = (m: string, now = Date.now()) => now >= svelamentoDi(m).getTime();

const fmtMese = new Intl.DateTimeFormat("it-IT", { month: "long" });
const fmtMeseAnno = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const fmtGiorno = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
export const nomeMese = (m: string) => { const { y, mo } = parts(m); return fmtMese.format(new Date(y, mo - 1, 1)); };
export const nomeMeseAnno = (m: string) => { const { y, mo } = parts(m); return fmtMeseAnno.format(new Date(y, mo - 1, 1)); };
export const giorno = (d: Date) => fmtGiorno.format(d);

export const leggiIncipit = (id: string, d: any): Incipit | null =>
  MESE_RE.test(id) && typeof d?.frase === "string" && d.frase ? { mese: id, frase: d.frase, creato: Number(d.creato) || 0 } : null;
export const leggiCapitolo = (id: string, d: any): CapitoloPub | null =>
  typeof d?.content === "string" && typeof d?.title === "string"
    ? { id, ordine: Number(d.ordine) || 0, title: d.title, content: d.content, firma: String(d.firma || ""), autoreId: String(d.autoreId || "") }
    : null;
// i giri del racconto: gli incipit in ordine di mese, numerati dal primo; il racconto mostra solo quelli con capitoli
export const giri = (incipit: Incipit[], capitoli: Record<string, CapitoloPub[]>): Giro[] =>
  [...incipit].sort((a, b) => a.mese.localeCompare(b.mese))
    .map((x, i) => ({ ...x, giro: i + 1, capitoli: [...(capitoli[x.mese] || [])].sort((a, b) => a.ordine - b.ordine) }));

// La frase dell'incipit si sceglie tra le parole dell'estratto pubblico: dalla prima all'ultima toccata, presa
// esattamente com'è nell'estratto (spazi e punteggiatura compresi), così le regole la ritrovano byte per byte.
export type Parola = { t: string; s: number; e: number };
export const parole = (ex: string): Parola[] => {
  const out: Parola[] = [], re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ex))) out.push({ t: m[0], s: m.index, e: m.index + m[0].length });
  return out;
};
export const fraseTra = (ex: string, ws: Parola[], a: number, b: number) => {
  if (!ws.length) return "";
  const i = Math.max(0, Math.min(a, b)), j = Math.min(ws.length - 1, Math.max(a, b));
  return ex.slice(ws[i].s, ws[j].e);
};
export const fraseOk = (ex: string, f: string) => f.length >= FRASE_MIN && f.length <= FRASE_MAX && f.trim() === f && ex.includes(f);

// i capitoli in gara di un mese: dagli scritti che si possono leggere (i propri e le copie anonime), senza doppioni
export const inGara = (mese: string, ...liste: any[][]) => {
  const seen = new Set<string>(), out: any[] = [];
  liste.forEach((l) => l.forEach((t) => { if (t && !seen.has(t.id) && staffettaOf(t) === mese) { seen.add(t.id); out.push(t); } }));
  return out;
};
