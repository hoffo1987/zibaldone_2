import { squircle, bevel, edgeAt, surfaceAt, shapeOf, lightRows, lightMix, spring } from "./liquid";

test("the bevel is a convex squircle: from the edge to the flat top, with no step where it meets the flat", () => {
  expect(squircle(0)).toBe(0); expect(squircle(1)).toBe(1);
  expect(squircle(0.5)).toBeGreaterThan(0.9);
  // steep at the edge, flat (slope zero) where the plane begins
  const P = bevel(24, 36);
  expect(P.s[0]).toBeGreaterThan(5); expect(P.s[P.steps - 1]).toBeLessThan(0.01);
});

test("refraction is strongest at the rim and fades continuously to nothing on the flat glass", () => {
  const P = bevel(24, 36);
  // the physics of a 1.5 glass gives a push of about three quarters of the bevel width at the rim
  expect(P.max).toBeGreaterThan(14); expect(P.max).toBeLessThan(22);
  // the push peaks just inside the edge (the glass is still thin at the very rim), then only falls
  const peak = P.d.indexOf(Math.max(...P.d));
  expect(peak).toBeLessThan(P.steps * 0.05);
  for (let i = peak + 1; i < P.steps; i++) expect(P.d[i]).toBeLessThanOrEqual(P.d[i - 1] + 1e-6);
  expect(P.d[P.steps - 1]).toBeLessThan(0.05);
  // neighbouring samples never jump: the rim melts into the flat, there is no seam
  for (let i = 1; i < P.steps; i++) expect(P.d[i - 1] - P.d[i]).toBeLessThan(P.max * 0.08);
});

test("the surface: flat in the middle, tilted outward and pushing inward on the bevel, round in the corners", () => {
  const w = 400, h = 200, r = 24, b = 28, P = bevel(b, b * 1.5);
  expect(surfaceAt(200, 100, w, h, r, b, P)).toEqual({ vx: 0, vy: 0, nx: 0, ny: 0, nz: 1 });
  const right = surfaceAt(398, 100, w, h, r, b, P);
  expect(right.vx).toBeLessThan(-0.5); expect(right.nx).toBeGreaterThan(0.5); expect(right.nz).toBeLessThan(0.8);
  expect(Math.hypot(right.nx, right.ny, right.nz)).toBeCloseTo(1, 5);
  const top = surfaceAt(200, 2, w, h, r, b, P);
  expect(top.vy).toBeGreaterThan(0.5); expect(top.ny).toBeLessThan(-0.5);
  const corner = surfaceAt(4, 4, w, h, r, b, P);
  expect(corner.vx).toBeCloseTo(corner.vy, 5); expect(corner.nx).toBeCloseTo(corner.ny, 5); expect(corner.nx).toBeLessThan(0);
  const [din] = edgeAt(200, 100, w, h, r); expect(din).toBe(100);
});

test("small glass is almost clear with a deep rounded edge, big glass is frostier", () => {
  const btn = shapeOf("btn", 120, 40), pane = shapeOf("pane", 600, 300), win = shapeOf("win", 500, 600);
  expect(btn.frost).toBeLessThan(1); expect(btn.b).toBeCloseTo(16.8);
  expect(pane.frost).toBeGreaterThan(btn.frost); expect(win.frost).toBeGreaterThan(pane.frost);
  expect(pane.thick).toBeCloseTo(pane.b * 1.5);
});

test("the light comes from the bend map: the flat glass is the backdrop itself, a bevel facing the light is brighter", () => {
  // λ from the colour matrix for a map pixel (R, G, B in 0..1), then the arithmetic mix on a backdrop value
  const lam = (values, [R, G, B]) => { const m = values.split(/\s+/).map(Number); return Math.min(1, Math.max(0, m[0] * R + m[1] * G + m[2] * B + m[4])); };
  const glass = (bg, l, dark) => { const k = lightMix(dark); return Math.min(1, Math.max(0, k.k1 * bg * l + k.k2 * bg + k.k3 * l + k.k4)); };
  const flatPx = [128 / 255, 128 / 255, 0];
  for (const dark of [false, true]) for (const az of [-2.6, -1.6, -0.6]) {
    const l = lam(lightRows(az, dark), flatPx);
    expect(l).toBeCloseTo(0.5, 3);
    for (const bg of [0.1, 0.5, 0.9]) expect(glass(bg, l, dark)).toBeCloseTo(bg, 3);
  }
  // light from the left: the left bevel pushes the backdrop to the right (R high) and faces the light
  const rows = lightRows(-Math.PI + 0.05, true), leftEdge = [1, 0.5, 0.6], rightEdge = [0, 0.5, 0.6];
  expect(glass(0.3, lam(rows, leftEdge), true)).toBeGreaterThan(0.6);
  expect(glass(0.3, lam(rows, rightEdge), true)).toBeLessThan(0.3);
});

test("the glass settles on a soft spring", () => {
  expect(spring(0)).toBe(0); expect(spring(1)).toBe(1);
  const peak = Math.max(...Array.from({ length: 90 }, (_, i) => spring(i / 100)));
  expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThan(1.12);
});
