// La copia anonima per chi non è admin: deve portare solo titolo, testo e disegno, mai chi ha scritto né quando.
import { PUB_KEYS, pubOf, pubSig } from "./testi";

const scritto = {
  id: "abc", title: "Titolo", content: "<div>ciao</div>", strokes: [{ c: "#000", points: [{ x: 1, y: 2 }] }], w: 900, h: 600,
  author: "Mario Rossi", userId: "uid-1", timestamp: 1, updatedAt: 2, rating: 4, svelato: true, isStarred: true, _anon: true, _tx: "ciao",
};

test("tiene solo i campi pubblici", () => {
  expect(pubOf(scritto)).toEqual({ title: "Titolo", content: "<div>ciao</div>", strokes: scritto.strokes, w: 900, h: 600 });
  expect(PUB_KEYS).toEqual(["title", "content", "strokes", "w", "h"]);
});

test("i campi che mancano non diventano undefined (Firestore li rifiuterebbe)", () => {
  const o = pubOf({ title: "x", content: "y", userId: "u" });
  expect(Object.keys(o)).toEqual(["title", "content"]);
  expect(pubOf(null)).toEqual({});
});

test("la firma ignora l'ordine delle chiavi e i campi privati", () => {
  const riordinato = { h: 600, w: 900, strokes: [{ points: [{ y: 2, x: 1 }], c: "#000" }], content: "<div>ciao</div>", title: "Titolo" };
  expect(pubSig(riordinato)).toBe(pubSig(scritto));
  expect(pubSig({ ...scritto, author: "Altro", rating: 1 })).toBe(pubSig(scritto));
  expect(pubSig({ ...scritto, content: "<div>diverso</div>" })).not.toBe(pubSig(scritto));
});
