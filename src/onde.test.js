// Il segnale delle scintille: le onde si ripetono identiche ogni FRAME (così l'onda che corre non salta), restano tra -1
// e 1, e la traccia di una frase che va a capo continua da una riga all'altra posandosi sullo zero solo agli estremi.
import { FRAME, onda, percorso, tratto, canaliDi, faseCanale, seme } from "./onde";

const TIPI = ["riconosco", "bellissima", "ridere", "commosso"];

test.each(TIPI)("l’onda %s si ripete ogni FRAME e resta tra -1 e 1", (t) => {
  for (let x = -200; x < 400; x += 0.37) {
    expect(Math.abs(onda(t, x) - onda(t, x + FRAME))).toBeLessThan(1e-9);
    expect(Math.abs(onda(t, x))).toBeLessThanOrEqual(1 + 1e-9);
  }
});

test("le quattro onde sono diverse tra loro", () => {
  const sig = (t) => Array.from({ length: 96 }, (_, x) => onda(t, x).toFixed(3)).join();
  expect(new Set(TIPI.map(sig)).size).toBe(4);
});

test("la traccia di una frase su due righe è continua e si posa sullo zero agli estremi", () => {
  const ys = (d) => d.split(/[ML]/).filter(Boolean).map((p) => Number(p.trim().split(" ")[1]));
  const a = ys(tratto("riconosco", 0, 120, 200, 8, 3, 5)), b = ys(tratto("riconosco", 120, 80, 200, 8, 3, 5));
  expect(Math.abs(a[a.length - 1] - b[0])).toBeLessThan(0.05);
  expect(a[0]).toBeCloseTo(8, 5);
  expect(b[b.length - 1]).toBeCloseTo(8, 5);
  expect(ys(percorso("ridere", 100, 6, 4)).every((y) => y >= 2 - 1e-9 && y <= 10 + 1e-9)).toBe(true);
});

test("i canali: uno per emozione, il più scelto in testa; la fase è stabile e dentro il FRAME", () => {
  expect(canaliDi(["ridere", "commosso", "ridere", "riconosco"])).toEqual([{ tipo: "ridere", n: 2 }, { tipo: "riconosco", n: 1 }, { tipo: "commosso", n: 1 }]);
  expect(canaliDi([])).toEqual([]);
  const s = seme("12-40");
  expect(seme("12-40")).toBe(s);
  [0, 1, 2, 3].forEach((c) => { const f = faseCanale(s, c); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(FRAME); });
});
