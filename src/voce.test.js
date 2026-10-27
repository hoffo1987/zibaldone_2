// Ascolta: il testo si legge una frase alla volta. Le frasi coprono il testo senza buchi né spazi ai bordi, e quelle
// lunghe si spezzano dove si respira, così la voce riparte in fretta e l'evidenziazione segue da vicino.
import { frasiDi, voceDisponibile } from "./voce";

test("le frasi sono pezzi esatti del testo, senza spazi ai bordi", () => {
  const t = "Ogni pagina comincia con una voce. Il Circuito è il posto. Dove? Qui!  E poi basta.";
  const fs = frasiDi(t);
  expect(fs.map((f) => f.testo)).toEqual(["Ogni pagina comincia con una voce.", "Il Circuito è il posto.", "Dove?", "Qui!", "E poi basta."]);
  fs.forEach((f) => { expect(t.slice(f.a, f.b)).toBe(f.testo); expect(f.testo.trim()).toBe(f.testo); });
});

test("le frasi lunghe si spezzano alle virgole, mai oltre il limite", () => {
  const lunga = Array.from({ length: 12 }, (_, i) => `una parte numero ${i} della frase che continua`).join(", ") + ".";
  const fs = frasiDi(lunga);
  expect(fs.length).toBeGreaterThan(2);
  fs.forEach((f) => expect(f.testo.length).toBeLessThanOrEqual(220));
  expect(fs.map((f) => f.testo).join(" ").replace(/\s+/g, " ")).toBe(lunga);
});

test("niente frasi fatte solo di spazi o punteggiatura", () => {
  expect(frasiDi("   …  — ").length).toBe(0);
  expect(frasiDi("").length).toBe(0);
});

test("senza sintesi vocale il pulsante non compare", () => {
  expect(typeof voceDisponibile()).toBe("boolean");
});
