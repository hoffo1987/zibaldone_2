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
