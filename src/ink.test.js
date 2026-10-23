import { layoutOf, relayout, groupsOf, inkBottom, anchorInk, inkPreviewOf } from "./ink";

const box = (x, y, w = 40, h = 24) => ({ x, y, w, h });
const dot = (x, y, size = 3) => ({ tool: "pen", size, points: [{ x, y }, { x: x + 1, y }] });

// telefono: foglio largo 378, testo che va a capo spesso; PC: largo 900, le stesse parole su meno righe
const phone = layoutOf([["t0", box(24, 24)], ["t5", box(150, 480)], ["b0", box(24, 504, 330, 32)], ["t9", box(24, 540)]], 378, 24);
const pc = layoutOf([["t0", box(24, 24)], ["t5", box(600, 200)], ["b0", box(24, 224, 852, 32)], ["t9", box(24, 260)]], 900, 24);

test("i tratti vicini formano un disegno solo, quelli lontani no", () => {
  const g = groupsOf([dot(170, 478), dot(195, 482), dot(180, 515), dot(200, 1580)]);
  expect(g).toEqual([[0, 1, 2], [3]]);
});

test("un disegno fatto su una parola la segue quando il testo va a capo altrove", () => {
  const [s] = relayout([dot(160, 490)], phone, pc);
  expect(s.points[0]).toEqual({ x: 610, y: 210 });
});

test("su una riga vuota resta sulla riga e alla stessa frazione della larghezza", () => {
  const [s] = relayout([dot(189, 520)], phone, pc);
  expect(s.points[0].y).toBeCloseTo(240);
  expect(s.points[0].x + 0.5).toBeCloseTo(24 + ((189.5 - 24) / 330) * 852); // il centro del punto
});

test("sotto il testo mantiene la distanza dalla fine dello scritto", () => {
  const [s] = relayout([dot(189, 1580)], phone, pc);
  expect(s.points[0].y).toBeCloseTo(1580 - phone.end + pc.end);
});

test("il foglio del PC non si allunga per la larghezza del telefono", () => {
  const out = relayout([dot(160, 490), dot(189, 520), dot(189, 1580)], phone, pc);
  expect(inkBottom(out)).toBeLessThan(1600);
});

test("un disegno più largo del foglio si rimpicciolisce e rientra", () => {
  const wide = { tool: "line", size: 4, points: [{ x: 40, y: 40 }, { x: 860, y: 40 }] };
  const [s] = relayout([wide], pc, phone);
  const xs = s.points.map((p) => p.x);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...xs)).toBeLessThanOrEqual(378);
  expect(s.size).toBeLessThan(4);
});

test("sopra una foto si sposta e cambia misura con la foto", () => {
  const a = layoutOf([["i0", box(24, 24, 600, 400)]], 900, 24), b = layoutOf([["i0", box(20, 20, 300, 200)]], 340, 20);
  const [s] = relayout([{ tool: "line", size: 3, points: [{ x: 124, y: 124 }, { x: 224, y: 124 }] }], a, b);
  expect(s.points[0]).toEqual({ x: 70, y: 70 });
  expect(s.points[1]).toEqual({ x: 120, y: 70 });
});

test("l'aggancio salvato vale più della ricostruzione del foglio di chi ha scritto", () => {
  // sul telefono vero la riga vuota era una riga più su di quanto la ricostruisce il PC (caratteri ingranditi dal sistema)
  const real = layoutOf([["t0", box(24, 24)], ["b0", box(24, 472, 330, 32)], ["t9", box(24, 508)]], 378, 24);
  const saved = anchorInk([dot(189, 488)], real);
  expect(saved[0].a).toMatchObject({ k: "b0", y: 472 });
  const [s] = relayout(saved, phone, pc);
  expect(s.points[0].y).toBeCloseTo(224 + 16);
  expect(s.a).toBeUndefined();
});

test("ricostruito, un disegno in una riga vuota si mette al centro della riga", () => {
  const face = [dot(170, 478), dot(195, 482), { tool: "pen", size: 3, points: [{ x: 167, y: 512 }, { x: 187, y: 501 }, { x: 207, y: 524 }] }];
  const out = relayout(face, phone, pc), ys = out.flatMap((s) => s.points.map((p) => p.y));
  expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(240, 0);
});

test("l'anteprima mostra il primo disegno, non tutto il foglio", () => {
  expect(inkPreviewOf([dot(170, 478), dot(200, 1580)])).toHaveLength(1);
});
