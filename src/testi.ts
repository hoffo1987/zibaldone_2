// Copia pubblica e anonima di uno scritto (testi/{id}), letta da chi non è admin.
// Solo i campi che le regole di Firestore permettono: mai autore, uid, date o voti.
export const PUB_KEYS = ["title", "content", "strokes", "w", "h"];
export const pubOf = (t: any) => { const o: any = {}; PUB_KEYS.forEach((k) => { if (t?.[k] !== undefined) o[k] = t[k]; }); return o; };
// confronto che non dipende dall'ordine delle chiavi (i tratti tornano da Firestore come mappe)
export const stable = (v: any): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v ?? null);
export const pubSig = (t: any) => stable(pubOf(t));
