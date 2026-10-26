import { roundedSquare, extrude, tube, Curve3, LineCurve3, polyline, sphere, torus, box, transform, merge } from "./geometry";

const unitNormals = (nrm) => { for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]); if (Math.abs(l - 1) > 1e-5) return false; } return true; };
const plate = (exact) => extrude(roundedSquare(29.5, 14.5), { depth: 5.8, bevelThickness: 3.4, bevelSize: 2.6, bevelSegments: 10, curveSegments: 40, exact });

test("the extruded badge has one flat unit normal per triangle and closed lids", () => {
  const g = plate(false);
  expect(g.pos.length % 9).toBe(0);
  expect(unitNormals(g.nrm)).toBe(true);
  for (let i = 0; i < g.nrm.length; i += 9) {
    expect(g.nrm[i]).toBe(g.nrm[i + 3]);
    expect(g.nrm[i + 2]).toBe(g.nrm[i + 8]);
  }
  // both lids together cover the rounded square twice (front and back) with opposite orientation
  let front = 0, back = 0;
  for (let i = 0; i < g.pos.length; i += 9) {
    const area = 0.5 * ((g.pos[i + 3] - g.pos[i]) * (g.pos[i + 7] - g.pos[i + 1]) - (g.pos[i + 4] - g.pos[i + 1]) * (g.pos[i + 6] - g.pos[i]));
    if (g.nrm[i + 2] > 0.999) front += area; else if (g.nrm[i + 2] < -0.999) back += area;
  }
  const expected = 59 * 59 - (4 - Math.PI) * 14.5 * 14.5;
  expect(front).toBeCloseTo(expected, 0);
  expect(back).toBeCloseTo(-expected, 0);
});

test("the bevel no longer has the notch three.js produced on the left edge", () => {
  // widest layer (z = 0): the ends of the straight left and right sides lie on x = ±(29.5 + 2.6)
  const sides = (g) => { const xs = []; for (let i = 0; i < g.pos.length; i += 3) if (Math.abs(g.pos[i + 2]) < 1e-6 && Math.abs(g.pos[i + 1]) <= 15.1 && Math.abs(g.pos[i]) > 20) xs.push(Math.abs(g.pos[i])); return xs; };
  expect(sides(plate(false)).length).toBeGreaterThan(0);
  for (const x of sides(plate(false))) expect(x).toBeCloseTo(32.1, 2);
  // the exact three.js r160 contour keeps the 1e-15 segment and pulls one corner of the side inwards
  expect(Math.min(...sides(plate(true)))).toBeLessThan(31);
});

test("tubes follow their curve with the arc-length parameter in aux", () => {
  const arc = tube(new Curve3((t) => ({ x: Math.cos(t * 5) * 15, y: Math.sin(t * 5) * 15, z: 7 })), 160, 2.55, 20);
  expect(arc.pos.length / 3).toBe(161 * 21);
  expect(arc.idx.length).toBe(160 * 20 * 6);
  expect(unitNormals(arc.nrm)).toBe(true);
  expect(arc.aux[0]).toBe(0);
  expect(arc.aux[arc.aux.length - 1]).toBe(1);
  for (let i = 0; i < arc.pos.length; i += 3) expect(Math.abs(Math.hypot(arc.pos[i], arc.pos[i + 1]) - 15)).toBeLessThanOrEqual(2.551);
  const line = tube(new LineCurve3({ x: -1, y: 0, z: 0 }, { x: 15, y: 0, z: 0 }), 8, 1.55, 14);
  for (let i = 0; i < line.pos.length; i += 3) expect(Math.hypot(line.pos[i + 1], line.pos[i + 2])).toBeCloseTo(1.55, 5);
  const trace = tube(polyline([[-22, -20], [-22, -6], [-12, 4], [-12, 18]], -6.4), 8, 0.65, 6);
  expect(trace.idx.every((i) => i < trace.pos.length / 3)).toBe(true);
});

test("primitive shapes, transforms and merging keep indices and normals consistent", () => {
  const s = sphere(1, 32, 22), t = torus(44.5, 0.2, 6, 144), b = box(16, 11, 2.4);
  expect(s.pos.length / 3).toBe(33 * 23);
  expect(t.idx.length).toBe(6 * 144 * 6);
  expect(b.idx.length).toBe(36);
  [s, t, b].forEach((g) => expect(unitNormals(g.nrm)).toBe(true));
  const flat = transform(s, [1, 2, 3], [1.9, 1.9, 0.6]);
  expect(unitNormals(flat.nrm)).toBe(true);
  expect(flat.nrm[2]).toBeCloseTo(s.nrm[2] / 0.6 / Math.hypot(s.nrm[0] / 1.9, s.nrm[1] / 1.9, s.nrm[2] / 0.6), 6);
  const m = merge([s, t, b]);
  expect(m.idx.length).toBe(s.idx.length + t.idx.length + b.idx.length);
  expect(Math.max(...m.idx)).toBe(m.pos.length / 3 - 1);
});
