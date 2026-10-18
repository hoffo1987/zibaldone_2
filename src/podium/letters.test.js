import { layoutSign, signedField } from "./letters";

// a monospaced stand-in for the canvas: every character is 50 px wide, 70 px tall above the baseline, 20 below
const metrics = { advance: (s) => Array.from(s).length * 50, box: () => ({ left: 0, right: 50, asc: 70, desc: 20 }) };
const text = { kicker: "Lavori in corso", title: ["Il podio", "il 3"], note: ["fino al 5,", "il 4"], label: "" };

test("the sign is laid out as centred lines of letters, without the spaces, top to bottom", () => {
  const g = layoutSign(text, metrics, 100, 10);
  expect(g.map((p) => p.ch).join("")).toBe("LAVORIINCORSOIlpodioil3finoal5,il4");
  expect(g.map((p) => p.index)).toEqual(g.map((_, i) => i));
  // each line is centred on x = 0 (pad included on both sides)
  for (let line = 0; line < 5; line++) {
    const ls = g.filter((p) => p.line === line);
    expect(Math.min(...ls.map((p) => p.x0)) + Math.max(...ls.map((p) => p.x1))).toBeCloseTo(0, 6);
  }
  // lines go down, and the whole block is centred vertically
  const base = (line) => g.find((p) => p.line === line).y0;
  for (let line = 1; line < 5; line++) expect(base(line)).toBeLessThan(base(line - 1));
  expect(Math.max(...g.map((p) => p.y1)) + Math.min(...g.map((p) => p.y0))).toBeCloseTo(0, 6);
  // the title is bigger and thicker than the note
  const title = g.find((p) => p.line === 1), note = g.find((p) => p.line === 3);
  expect(title.x1 - title.x0).toBeGreaterThan((note.x1 - note.x0) * 2);
  expect(title.style.depth).toBeGreaterThan(note.style.depth);
});

test("the distance field is 0.5 on the outline, higher inside and lower outside", () => {
  const w = 40, h = 40, a = new Uint8Array(w * h);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) a[y * w + x] = 255;
  const f = signedField(a, w, h, 8);
  const at = (x, y) => f[y * w + x] / 255;
  expect(at(20, 20)).toBe(1); // 10 px inside: beyond the spread
  expect(at(0, 0)).toBe(0);
  expect(at(10, 20)).toBeGreaterThan(0.5); expect(at(9, 20)).toBeLessThan(0.5);
  expect(at(14, 20)).toBeCloseTo(0.5 + 4.5 / 16, 1);
  expect(at(5, 20)).toBeCloseTo(0.5 - 4.5 / 16, 1);
});
