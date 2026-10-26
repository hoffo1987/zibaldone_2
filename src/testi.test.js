// La copia anonima per chi non è admin: deve portare solo titolo, testo e disegno, mai chi ha scritto né quando.
import { pubOf, pubSig, excerptOf, isDiary, rankWritings, canEvaluate } from "./testi";

const scritto = {
  id: "abc", title: "Titolo", content: "<div>ciao</div>", strokes: [{ c: "#000", points: [{ x: 1, y: 2 }] }], w: 900, h: 600,
  author: "Mario Rossi", userId: "uid-1", timestamp: 1, updatedAt: 2, rating: 4, svelato: true, isStarred: true, _anon: true, _tx: "ciao",
};

test("i completi pubblicano solo un estratto e mai HTML, disegni o identità", () => {
  expect(pubOf(scritto)).toEqual({ version: 2, kind: "complete", title: "Titolo", excerpt: "c" });
  expect(pubOf({ ...scritto, kind: "diary" })).toEqual({ version: 2, kind: "diary", title: "Titolo", content: scritto.content, strokes: scritto.strokes, w: 900, h: 600 });
});

test("i campi che mancano non diventano undefined (Firestore li rifiuterebbe)", () => {
  const o = pubOf({ title: "x", content: "y", userId: "u" });
  expect(o).toEqual({ version: 2, kind: "complete", title: "x", excerpt: "" });
  expect(Object.values(pubOf(null))).not.toContain(undefined);
});

test.each(["", "x", "ab", "Tre", "Un breve pensiero", "🌿😀✨ un giorno nuovo", "testo ".repeat(1000)])("l’estratto non contiene mai tutto il testo: caso %#", text => {
  const excerpt = excerptOf(`<p>${text}</p><img src="data:image/png;base64,AAAA" alt="SEGRETO">`);
  expect(excerpt.length).toBeLessThanOrEqual(480);
  if (text.trim()) expect(excerpt).not.toBe(text.trim());
  expect(excerpt).not.toContain("SEGRETO");
  expect(excerpt).not.toContain("<");
});

test("i pensieri non sono valutabili e non entrano in classifica neppure con vecchi voti", () => {
  const diary = { id: "d", kind: "diary", rating: 5, isStarred: true };
  const complete = { id: "c", rating: 3 };
  expect(isDiary(diary)).toBe(true);
  expect(canEvaluate(diary)).toBe(false);
  expect(canEvaluate({ ...complete, _anon: true })).toBe(false);
  expect(rankWritings([diary, complete])).toEqual([complete]);
});

test("la firma ignora l'ordine delle chiavi e i campi privati", () => {
  const riordinato = { h: 600, w: 900, strokes: [{ points: [{ y: 2, x: 1 }], c: "#000" }], content: "<div>ciao</div>", title: "Titolo" };
  expect(pubSig(riordinato)).toBe(pubSig(scritto));
  expect(pubSig({ ...scritto, author: "Altro", rating: 1 })).toBe(pubSig(scritto));
  expect(pubSig({ ...scritto, content: "<div>diverso</div>" })).not.toBe(pubSig(scritto));
});

test("un pensiero firmato porta il nome solo se l'autore l'ha scelto, e mai un completo", () => {
  const diary = { ...scritto, kind: "diary" };
  expect(pubOf(diary).firma).toBeUndefined();
  expect(pubOf({ ...diary, firmato: false })).not.toHaveProperty("autoreId");
  const signed = pubOf({ ...diary, firmato: true });
  expect(signed).toMatchObject({ firma: "Mario Rossi", autoreId: "uid-1" });
  // la copia pubblica riletta conserva la firma: nessuna riscrittura a ogni caricamento
  expect(pubSig(signed)).toBe(pubSig({ ...diary, firmato: true }));
  expect(pubOf({ ...scritto, firmato: true })).toEqual({ version: 2, kind: "complete", title: "Titolo", excerpt: "c" });
  expect(pubOf({ ...diary, firmato: true, author: undefined })).not.toHaveProperty("firma");
});
test("la copia pubblica del diario porta il legame con il pensiero da cui è nato, e solo quello", () => {
  const eco = { title: "Eco", kind: "diary", content: "<p>x</p>", strokes: [], w: 900, h: 600, nataDa: { id: "orig", cit: "una frase", extra: 1 } };
  expect(pubOf(eco).nataDa).toEqual({ id: "orig", cit: "una frase" });
  expect(pubOf({ ...eco, kind: "complete", excerpt: "x" })).not.toHaveProperty("nataDa");
  expect(pubOf({ ...eco, nataDa: { id: "", cit: "x" } })).not.toHaveProperty("nataDa");
  expect(pubSig({ ...eco, nataDa: undefined })).toBe(pubSig({ title: "Eco", kind: "diary", content: "<p>x</p>", strokes: [], w: 900, h: 600 }));
});
