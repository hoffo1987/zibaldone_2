import { lensAt, bandOf } from "./liquid";

test("the glass is flat in the middle and bends the backdrop inward near the edge, more the closer it gets", () => {
  const w = 400, h = 200, r = 24, band = bandOf(w, h);
  expect(band).toBe(26);
  expect(lensAt(200, 100, w, h, r, band)).toEqual([0, 0, 0]);
  // on the right edge the sample moves left (inward), on the top edge it moves down
  const right = lensAt(399.5, 100, w, h, r, band), top = lensAt(200, 0.5, w, h, r, band);
  expect(right[0]).toBeLessThan(-0.9); expect(right[1]).toBeCloseTo(0);
  expect(top[1]).toBeGreaterThan(0.9); expect(top[0]).toBeCloseTo(0);
  expect(right[2]).toBeCloseTo(0.88, 2);
  // stronger near the edge than further in, nothing past the band
  expect(Math.abs(lensAt(392, 100, w, h, r, band)[0])).toBeGreaterThan(Math.abs(lensAt(385, 100, w, h, r, band)[0]));
  expect(lensAt(400 - band - 1, 100, w, h, r, band)).toEqual([0, 0, 0]);
  // in a rounded corner the push points back to the corner's centre (diagonal), never outward
  const c = lensAt(3, 3, w, h, r, band);
  expect(c[0]).toBeGreaterThan(0); expect(c[1]).toBeGreaterThan(0); expect(c[0]).toBeCloseTo(c[1], 5);
});

test("small panes get a thin rim, big ones a thicker one, within limits", () => {
  expect(bandOf(30, 30)).toBe(10);
  expect(bandOf(160, 120)).toBeCloseTo(16.8);
  expect(bandOf(1200, 900)).toBe(26);
});
