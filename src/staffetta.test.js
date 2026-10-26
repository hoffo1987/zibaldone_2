// La staffetta: la frase dell'incipit è un pezzo esatto dell'estratto, il legame del capitolo viaggia con la copia
// anonima e le date seguono quelle del podio.
import { pubOf, excerptOf } from "./testi";
import { fraseOk, fraseTra, giri, inGara, meseDi, meseDopo, mesePrima, parole, staffettaOf, svelamentoDi, svelato, ultimoGiorno } from "./staffetta";

test("il capitolo porta il mese della staffetta nella copia anonima, mai nel diario e mai un mese finto", () => {
  const cap = { title: "Capitolo", content: "<p>uno due tre quattro cinque sei sette otto nove dieci</p>", userId: "u", author: "Nome", staffetta: "2026-11" };
  expect(pubOf(cap)).toEqual({ version: 2, kind: "complete", title: "Capitolo", excerpt: excerptOf(cap.content), staffetta: "2026-11" });
  expect(pubOf({ ...cap, staffetta: "novembre" }).staffetta).toBeUndefined();
  expect(pubOf({ ...cap, kind: "diary" }).staffetta).toBeUndefined();
  expect(staffettaOf({ kind: "diary", staffetta: "2026-11" })).toBeNull();
  expect(staffettaOf({ staffetta: "2026-13" })).toBeNull();
});

test("la frase scelta tra le parole è presa esattamente dall’estratto, punteggiatura e spazi compresi", () => {
  const ex = "Il treno partì all’alba,  senza nessuno a bordo.";
  const ws = parole(ex);
  expect(ws.map((w) => w.t)).toEqual(["Il", "treno", "partì", "all’alba,", "senza", "nessuno", "a", "bordo."]);
  const f = fraseTra(ex, ws, 5, 1);
  expect(f).toBe("treno partì all’alba,  senza nessuno");
  expect(ex.includes(f)).toBe(true);
  expect(fraseOk(ex, f)).toBe(true);
  expect(fraseOk(ex, "Il")).toBe(false);
  expect(fraseOk(ex, "treno arrivò")).toBe(false);
  expect(fraseOk(ex, " Il treno")).toBe(false);
  expect(fraseTra("", [], 0, 0)).toBe("");
});

test("i mesi: scrittura fino all’ultimo giorno, racconto svelato dal 3 del mese dopo, anche a cavallo d’anno", () => {
  expect(meseDi(new Date(2026, 11, 31, 23, 30).getTime())).toBe("2026-12");
  expect(meseDopo("2026-12")).toBe("2027-01");
  expect(mesePrima("2027-01")).toBe("2026-12");
  expect(ultimoGiorno("2026-02").getDate()).toBe(28);
  expect(svelamentoDi("2026-12")).toEqual(new Date(2027, 0, 3));
  expect(svelato("2026-11", new Date(2026, 11, 2, 23, 59).getTime())).toBe(false);
  expect(svelato("2026-11", new Date(2026, 11, 3).getTime())).toBe(true);
});

test("i giri del racconto vanno in ordine di mese, con i capitoli nell’ordine scelto", () => {
  const g = giri([{ mese: "2026-11", frase: "b", creato: 2 }, { mese: "2026-10", frase: "a", creato: 1 }],
    { "2026-10": [{ id: "y", ordine: 1 }, { id: "x", ordine: 0 }] });
  expect(g.map((x) => [x.mese, x.giro])).toEqual([["2026-10", 1], ["2026-11", 2]]);
  expect(g[0].capitoli.map((c) => c.id)).toEqual(["x", "y"]);
  expect(g[1].capitoli).toEqual([]);
});

test("i capitoli in gara uniscono propri e copie anonime senza doppioni", () => {
  const own = [{ id: "a", staffetta: "2026-11" }, { id: "b" }];
  const pub = [{ id: "a", staffetta: "2026-11", _anon: true }, { id: "c", staffetta: "2026-11" }, { id: "d", staffetta: "2026-10" }];
  expect(inGara("2026-11", own, pub).map((t) => t.id)).toEqual(["a", "c"]);
});
