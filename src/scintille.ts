// ===== LE SCINTILLE =====
// Chi legge un pensiero del diario può accendere una scintilla su una frase: chi l'ha scritto la vede brillare sul
// foglio, senza sapere chi è stato (l'Admin personale ha invece il suo sigillo). Qui c'è la parte senza Firestore/React:
//   - il testo del lettore come lo vede chi seleziona (gli stessi a capo di plain() in sanitize.ts) e la sua mappa sul DOM;
//   - la selezione trasformata in { cit, pre, post }, e il ritrovamento della frase anche dopo una modifica;
//   - la fusione degli intervalli sovrapposti e l'intensità del brillio;
//   - le notifiche dell'autore, calcolate qui e mai scritte da altri (una per pensiero e giorno, e una per ogni eco).
// Il DOM del lettore non si tocca: il brillio passa dalla CSS Custom Highlight API (vedi ScintilleReader).
import type { Spunto } from "./spunti";

export type Tipo = "riconosco" | "bellissima" | "ridere" | "commosso";
export const TIPI: { id: Tipo; label: string }[] = [
  { id: "riconosco", label: "Mi ci riconosco" },
  { id: "bellissima", label: "Bellissima" },
  { id: "ridere", label: "Mi ha fatto ridere" },
  { id: "commosso", label: "Mi ha commosso" },
];
export const isTipo = (v: any): v is Tipo => TIPI.some((t) => t.id === v);
export const LIMITE = 5; // scintille per lettore e per pensiero (le regole lo fanno rispettare)
export const CIT_MAX = 280, CTX = 40, NOTA_MAX = 140, PAROLE_MIN = 3;

export type Ancora = { cit: string; pre: string; post: string };
export type Scintilla = Ancora & { id: string; tipo: Tipo; nota?: string; giorno: number; admin?: true };

// il giorno, mai l'ora: giorni dall'epoca (UTC), lo stesso numero che controllano le regole
export const giornoDi = (ms: number) => Math.floor(ms / 864e5);
export const oggi = () => giornoDi(Date.now());
export const msDelGiorno = (g: number) => g * 864e5;

// --- il testo ---
const SPACE = /[\s ​]/;
// spazi di ogni tipo ridotti a uno solo, come si legge
export const flat = (s: string) => s.replace(/[\s ​]+/g, " ").trim();

// Il testo piano normalizzato e, per ogni carattere, da quale carattere del testo grezzo viene: così un indice nel
// testo normalizzato torna un punto preciso del DOM.
export type Piano = { text: string; map: number[] };
export const normalizza = (raw: string): Piano => {
  let text = "", space = true;
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (SPACE.test(raw[i])) { if (!space) { text += " "; map.push(i); space = true; } continue; }
    text += raw[i]; map.push(i); space = false;
  }
  if (text.endsWith(" ")) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
};

const parole = (s: string) => flat(s).split(" ").filter(Boolean).length;
// La selezione [a, b) del testo normalizzato: la frase, con un poco di contesto prima e dopo per ritrovarla.
// null se non è una frase da scintilla (meno di tre parole, troppo lunga).
export const ancoraDi = (text: string, a: number, b: number): Ancora | null => {
  while (a < b && text[a] === " ") a++;
  while (b > a && text[b - 1] === " ") b--;
  const cit = text.slice(a, b);
  if (cit.length < 3 || cit.length > CIT_MAX || parole(cit) < PAROLE_MIN) return null;
  return { cit, pre: text.slice(Math.max(0, a - CTX), a), post: text.slice(b, b + CTX) };
};
export const motivoNo = (cit: string) => (cit.length > CIT_MAX ? "lunga" : parole(cit) < PAROLE_MIN ? "corta" : "");

// quanto combaciano le parole intorno: la coda di pre con ciò che precede, la testa di post con ciò che segue
const coda = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
const testa = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
// Dove sta la frase oggi, nel testo normalizzato del foglio (indiceDi): tra tutte le volte che compare, quella con il
// contesto più simile. Se l'autore ha cambiato
// proprio quelle parole la frase non c'è più (null): resta nell'elenco «Frasi che non ci sono più».
export const ritrova = (text: string, a: Ancora): { a: number; b: number } | null => {
  const cit = flat(a.cit);
  if (!cit) return null;
  let best = -1, score = -1;
  for (let i = text.indexOf(cit); i >= 0; i = text.indexOf(cit, i + 1)) {
    const s = coda(flat(a.pre), text.slice(Math.max(0, i - CTX), i).trimEnd()) + testa(flat(a.post), text.slice(i + cit.length, i + cit.length + CTX).trimStart());
    if (s > score) { score = s; best = i; }
  }
  return best < 0 ? null : { a: best, b: best + cit.length };
};

// --- la fusione ---
// Intervalli sovrapposti diventano tratti consecutivi; ogni tratto sa quante scintille lo coprono e quali.
export type Tratto = { a: number; b: number; n: number; ids: string[] };
export const fondi = (spans: { a: number; b: number; id: string }[]): Tratto[] => {
  const cuts = Array.from(new Set(spans.flatMap((s) => [s.a, s.b]))).sort((x, y) => x - y);
  const out: Tratto[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const ids = spans.filter((s) => s.a <= a && s.b >= b).map((s) => s.id);
    if (!ids.length) continue;
    const last = out[out.length - 1];
    // stessa copertura del tratto prima e attaccato: un solo tratto
    if (last && last.b === a && last.ids.length === ids.length && last.ids.every((x, k) => x === ids[k])) last.b = b;
    else out.push({ a, b, n: ids.length, ids });
  }
  return out;
};
// Quattro livelli di luce: una persona, due, tre o quattro, cinque e più. Sale presto e poi piano, come una valvola che
// si scalda: la differenza tra una e due persone si vede, quella tra nove e dieci no.
export const intensita = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);

// --- il testo del lettore nel DOM ---
// Come plain(): uno spazio dopo ogni a capo e alla fine di ogni blocco. Ogni pezzo di testo ricorda il suo nodo.
const BLOCK = new Set(["DIV", "P", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);
export type Indice = { raw: string; nodes: { node: Text; at: number }[]; piano: Piano };
export const indiceDi = (root: Node): Indice => {
  let raw = "";
  const nodes: { node: Text; at: number }[] = [];
  const visit = (n: Node) => {
    if (n.nodeType === 3) { nodes.push({ node: n as Text, at: raw.length }); raw += (n as Text).data; return; }
    if (n.nodeType !== 1) return;
    const tag = (n as Element).tagName;
    if (tag === "BR") { raw += " "; return; }
    n.childNodes.forEach(visit);
    if (BLOCK.has(tag)) raw += " ";
  };
  root.childNodes.forEach(visit);
  return { raw, nodes, piano: normalizza(raw) };
};
// un punto del DOM (nodo e offset) nel testo normalizzato; fuori dal testo: null
export const offsetDi = (ix: Indice, node: Node, off: number, root: Node): number | null => {
  let rawAt: number | null = null;
  if (node.nodeType === 3) {
    const t = ix.nodes.find((x) => x.node === node); if (!t) return null;
    rawAt = t.at + Math.min(off, (node as Text).data.length);
  } else {
    // un elemento: il punto è prima del figlio numero off. Si cerca il primo testo da lì in avanti
    if (!root.contains(node)) return null;
    const child = node.childNodes[off] || null;
    const after = ix.nodes.find((x) => child ? (child === x.node || child.contains(x.node) || !!(child.compareDocumentPosition(x.node) & 4)) : !!(node.compareDocumentPosition(x.node) & 4) && !node.contains(x.node));
    rawAt = after ? after.at : ix.raw.length;
  }
  // il primo carattere normalizzato che viene da qui o dopo
  const m = ix.piano.map;
  let lo = 0, hi = m.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (m[mid] < rawAt) lo = mid + 1; else hi = mid; }
  return lo;
};
// dall'intervallo [a, b) del testo normalizzato a un Range del DOM
const puntoDi = (ix: Indice, rawAt: number, end: boolean): { node: Text; off: number } | null => {
  for (let i = 0; i < ix.nodes.length; i++) {
    const t = ix.nodes[i], len = t.node.data.length;
    if (rawAt < t.at + len || (end && rawAt === t.at + len)) return rawAt < t.at ? { node: t.node, off: 0 } : { node: t.node, off: rawAt - t.at };
  }
  return null;
};
export const rangeDi = (ix: Indice, a: number, b: number, doc: Document = document): Range | null => {
  const m = ix.piano.map;
  if (a < 0 || b > m.length || a >= b) return null;
  const s = puntoDi(ix, m[a], false), e = puntoDi(ix, m[b - 1] + 1, true);
  if (!s || !e) return null;
  const r = doc.createRange();
  try { r.setStart(s.node, s.off); r.setEnd(e.node, e.off); } catch { return null; }
  return r;
};
// la selezione dentro root, nel testo normalizzato
export const selezioneDi = (ix: Indice, root: Node, sel: Selection | null): { a: number; b: number } | null => {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  const a = offsetDi(ix, r.startContainer, r.startOffset, root), b = offsetDi(ix, r.endContainer, r.endOffset, root);
  return a == null || b == null || b <= a ? null : { a, b };
};

// una scintilla letta da Firestore, solo se ha la forma giusta
export const leggiScintilla = (id: string, d: any): Scintilla | null =>
  d && typeof d.cit === "string" && isTipo(d.tipo) && typeof d.giorno === "number"
    ? { id, cit: d.cit, pre: typeof d.pre === "string" ? d.pre : "", post: typeof d.post === "string" ? d.post : "", tipo: d.tipo, nota: typeof d.nota === "string" ? d.nota : "", giorno: d.giorno, ...(d.admin === true ? { admin: true as const } : {}) }
    : null;
// sovrapposte: la stessa persona non accende due volte la stessa frase
export const siToccano = (x: { a: number; b: number }, y: { a: number; b: number }) => x.a < y.b && y.a < x.b;

// «Rispondi con un pensiero»: la frase citata va sul foglio come uno spunto (in corsivo, con la riga libera sotto)
export const spuntoEco = (cit: string): Spunto => {
  const text = `«${flat(cit)}»`;
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return { id: `eco-${(h >>> 0).toString(36)}`, set: "incipit", text, tipo: "traccia", when: [] };
};

// --- le notifiche dell'autore ---
// Una notifica per pensiero e per giorno, col conteggio; la data è il giorno, mai un'ora. La lettura è il numero di
// scintille già viste quel giorno: se ne arrivano altre, la notifica torna da leggere.
export const chiaveScintille = (pid: string, g: number) => `s_${pid}_${g}`;
export const chiaveEco = (id: string) => `e_${id}`;
export type Vista = { giorno: number; n: number };
export type Eco = { id: string; da: string; cit: string; title: string };
export const notificheScintille = (per: Record<string, Scintilla[]>, titoli: Record<string, string>, viste: Record<string, Vista>) => {
  const out: any[] = [];
  Object.keys(per).forEach((pid) => {
    const days = new Map<number, Scintilla[]>();
    per[pid].forEach((s) => { const l = days.get(s.giorno) || []; l.push(s); days.set(s.giorno, l); });
    days.forEach((list, g) => {
      const key = chiaveScintille(pid, g);
      out.push({ id: `scintilla:${key}`, key, tipo: "scintilla", pensieroId: pid, titolo: titoli[pid] || "Senza titolo", conteggio: list.length,
        tipi: TIPI.map((t) => t.id).filter((t) => list.some((s) => s.tipo === t)), giorno: g, timestamp: msDelGiorno(g), letta: (viste[key]?.n || 0) >= list.length });
    });
  });
  return out;
};
// l'eco ha la data del giorno in cui l'autore l'ha visto la prima volta (testi non ha date): la si scrive nelle viste
export const notificheEchi = (echi: Eco[], titoli: Record<string, string>, viste: Record<string, Vista>, today = oggi()) => echi.map((e) => {
  const key = chiaveEco(e.id), v = viste[key], g = v ? v.giorno : today;
  return { id: `eco:${key}`, key, tipo: "eco", pensieroId: e.da, ecoId: e.id, titolo: titoli[e.da] || "Senza titolo", cit: e.cit, ecoTitolo: e.title, giorno: g, timestamp: msDelGiorno(g), letta: (v?.n || 0) >= 1 };
});
