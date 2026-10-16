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
export const PUB_KEYS = ["version", "kind", "title", "excerpt", "content", "strokes", "w", "h"];
export const pubOf = (t: any) => {
  const o: any = { version: PUBLIC_VERSION, kind: writingKind(t), title: t?.title || "Senza titolo" };
  if (isDiary(t)) {
    o.content = t.content || ""; o.strokes = t.strokes || []; o.w = t.w || 900; o.h = t.h || 600;
  } else o.excerpt = typeof t?.excerpt === "string" ? t.excerpt : excerptOf(t?.content || "");
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
