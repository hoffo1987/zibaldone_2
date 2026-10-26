import { plain } from "./sanitize";

export type WritingKind = "complete" | "diary";
export const PUBLIC_VERSION = 2;
export const isDiary = (t: any) => t?.kind === "diary";
export const writingKind = (t: any): WritingKind => isDiary(t) ? "diary" : "complete";
export const writingLabel = (t: any) => isDiary(t) ? "Pensiero del diario" : "Scritto completo";
// Legacy writings remain complete writings. Never publish drawings, images or hidden HTML in an excerpt.
export const excerptOf = (html: string) => {
  const text = plain(html || "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  const selected = chars.slice(0, Math.min(480, Math.floor(chars.length * 0.3)));
  let bytes = 0;
  return selected.filter(c => { const n = c.codePointAt(0)!; bytes += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4; return bytes <= 480; }).join("").trimEnd();
};
export const PUB_KEYS = ["version", "kind", "title", "excerpt", "content", "strokes", "w", "h", "firma", "autoreId", "carta", "nataDa"];
// il foglio su cui si scrive: a quadretti, a righe o bianco. Chi scrive lo sceglie; se non l'ha scelto, quello del suo
// tipo (gli scritti completi a quadretti, i pensieri del diario a righe). Vale nell'editor, nelle anteprime e in lettura
export type Carta = "quadretti" | "righe" | "bianco";
export const CARTE: Carta[] = ["quadretti", "righe", "bianco"];
export const isCarta = (v: any): v is Carta => CARTE.includes(v);
export const cartaOf = (t: any): Carta => (isCarta(t?.carta) ? t.carta : isDiary(t) ? "righe" : "quadretti");
// la classe del foglio: .mm (quadretti), .ruled (righe), .plain (bianco)
export const paperClass = (c: Carta) => (c === "quadretti" ? "mm" : c === "righe" ? "ruled" : "plain");
// Un pensiero del diario è anonimo, a meno che l'autore non abbia scelto di firmarlo.
export const signatureOf = (t: any): { name: string; uid: string } | null => {
  if (!isDiary(t)) return null;
  if (t.firmato === true && typeof t.author === "string" && typeof t.userId === "string") return { name: t.author, uid: t.userId };
  if (t.firmato === undefined && typeof t.firma === "string" && typeof t.autoreId === "string") return { name: t.firma, uid: t.autoreId };
  return null;
};
// il legame di un pensiero nato da un altro: id dell'origine e la frase citata (vedi scintille.ts)
export const nataDaOf = (t: any): { id: string; cit: string } | null =>
  isDiary(t) && t?.nataDa && typeof t.nataDa.id === "string" && t.nataDa.id && typeof t.nataDa.cit === "string" && t.nataDa.cit ? { id: t.nataDa.id, cit: t.nataDa.cit } : null;
export const pubOf = (t: any) => {
  const o: any = { version: PUBLIC_VERSION, kind: writingKind(t), title: t?.title || "Senza titolo" };
  if (isDiary(t)) {
    o.content = t.content || ""; o.strokes = t.strokes || []; o.w = t.w || 900; o.h = t.h || 600;
    // firma facoltativa: dall'originale firmato (author/userId) o da una copia pubblica che già la porta
    const sign = signatureOf(t);
    if (sign) { o.firma = sign.name; o.autoreId = sign.uid; }
    // il pensiero nato da una frase di un altro: il legame viaggia con la copia, uguale all'originale
    const n = nataDaOf(t);
    if (n) o.nataDa = n;
  } else o.excerpt = typeof t?.excerpt === "string" ? t.excerpt : excerptOf(t?.content || "");
  if (isCarta(t?.carta)) o.carta = t.carta;
  return o;
};
export const readPublic = (t: any, id: string) => ({ ...pubOf(t), id, _anon: true });
export const canEvaluate = (t: any) => !isDiary(t) && !t?._anon;
export const rankWritings = (items: any[]) => items.filter(t => !isDiary(t) && (t.rating > 0 || t.isStarred))
  .sort((a, b) => (b.rating || 0) - (a.rating || 0) || Number(!!b.isStarred) - Number(!!a.isStarred) || a.timestamp - b.timestamp);
// confronto che non dipende dall'ordine delle chiavi (i tratti tornano da Firestore come mappe)
export const stable = (v: any): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v ?? null);
export const pubSig = (t: any) => stable(pubOf(t));
