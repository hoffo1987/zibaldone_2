import { buildMeshes, quality, LogoAnim, FramePacker, FRAME_FLOATS, OBJ, TAU } from "./scene";

const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const run = (a, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds - 1e-9; t += dt) a.step(dt); };

test("every batch of the static meshes stays inside the shared vertex and index buffers", () => {
  for (const mobile of [false, true]) {
    const m = buildMeshes(quality(mobile)), nv = m.vertices.length / 7;
    expect(m.vertices.every(Number.isFinite)).toBe(true);
    expect(m.colors.length / 3).toBe(m.plate.count); // la targa è non indicizzata: un colore per vertice
    expect(m.plate.first).toBe(0);
    let end = 0, vend = 0;
    for (const name of ["plate", "gold", "chip", "rim", "arc", "line", "cap", "ring0", "ring1"]) {
      const b = m[name];
      expect(b.base).toBe(vend);
      expect(b.count % 3).toBe(0);
      if (!b.indexed) { expect(b.first).toBe(b.base); vend += b.count; continue; }
      expect(b.first).toBe(end);
      end = b.first + b.count;
      let top = 0;
      for (let i = b.first; i < end; i++) top = Math.max(top, m.indices[i]);
      vend += top + 1;
    }
    expect(vend).toBe(nv);
    expect(m.indices.length - end).toBeLessThanOrEqual(1); // al più un indice di riempimento (buffer multiplo di 4 byte)
  }
});

test("the entrance builds the badge in 1.3 s, then the shape stops changing", () => {
  const a = new LogoAnim(true, quality(false));
  expect(a.badgeS).toBeCloseTo(0.35, 5);
  expect(a.arcK).toBe(0);
  expect(a.introDone).toBe(false);
  run(a, 1.32);
  expect(a.introDone).toBe(true);
  expect(a.arcK).toBe(1);
  expect(a.lineK).toBe(1);
  expect(new LogoAnim(false, quality(false)).introDone).toBe(true);
});

test("a kick spins the badge, which then settles on a whole turn", () => {
  const a = new LogoAnim(false, quality(false), seeded());
  run(a, 1);
  a.kick();
  expect(a.vel).toBeCloseTo(9.5, 6);
  expect(a.boost).toBe(1);
  run(a, 0.5);
  expect(Math.abs(a.ang)).toBeGreaterThan(1);
  run(a, 12);
  expect(a.vel).toBe(0);
  expect(a.ang / TAU).toBeCloseTo(Math.round(a.ang / TAU), 6);
});

test.each([1 / 60, 0.05, 0.4, 1])('rapid drags and long animation steps remain bounded (%s s)', dt => {
  const a = new LogoAnim(false, quality(false), seeded());
  a.drag = true;
  for (let i = 0; i < 1000; i++) { a.dragBy(2000, 0.001); a.step(dt); }
  expect(Math.abs(a.vel)).toBeLessThanOrEqual(42);
  expect(Math.abs(a.ang)).toBeLessThanOrEqual(TAU * 8);
  a.drag = false;
  for (let i = 0; i < Math.ceil(24 / dt); i++) a.step(dt);
  expect(a.vel).toBe(0);
  expect(a.ang / TAU).toBeCloseTo(Math.round(a.ang / TAU), 6);
  const p = new FramePacker(quality(false)); p.resize(340, 340); p.pack(a);
  expect(Array.from(p.data).every(Number.isFinite)).toBe(true);
});

test("sparks are written once per burst in a ring buffer that restarts after a pause", () => {
  const q = quality(false), a = new LogoAnim(false, q, seeded());
  run(a, 2);
  a.kick(); // prima spinta dopo una pausa: nuova origine dei tempi, l'anello intero si ricarica
  expect(a.dirty).toEqual([0, 80]);
  for (let i = 0; i < 44; i++) {
    const life = a.particles[i * 8 + 3], speed = Math.hypot(a.particles[i * 8], a.particles[i * 8 + 1], a.particles[i * 8 + 2] - 25);
    expect(life).toBeGreaterThanOrEqual(0.7);
    expect(life).toBeLessThanOrEqual(1.3);
    expect(speed).toBeGreaterThan(0); // moto radiale: la componente y non copia più la x
    expect(a.particles[i * 8 + 4]).toBe(0);
  }
  expect(new Set(Array.from({ length: 44 }, (_, i) => (a.particles[i * 8 + 1] / a.particles[i * 8]).toFixed(3))).size).toBeGreaterThan(30);
  expect(a.particles[44 * 8 + 3]).toBe(0); // il resto dell'anello è spento
  a.dirty = null;
  a.kick(); // seconda spinta mentre le prime scintille sono ancora vive: si continua nell'anello (44..79, poi 0..7)
  expect(a.dirty).toEqual([0, 80]);
  run(a, 2);
  a.dirty = null;
  a.kick(); // dopo una pausa si riparte da un'origine dei tempi nuova e il resto dell'anello si spegne
  expect(a.dirty).toEqual([0, 80]);
  expect(a.particleTime).toBe(0);
});

test("the frame block holds camera, lights, materials and sprites in the WGSL layout", () => {
  const q = quality(false), p = new FramePacker(q), a = new LogoAnim(false, q);
  p.resize(340, 340);
  expect(p.data.length).toBe(FRAME_FLOATS);
  expect(p.camZ).toBeCloseTo(54 / Math.tan((14.5 * Math.PI) / 180), 6); // come la versione three.js: max(184, 54 / tan(fov / 2))
  p.resize(200, 400);
  expect(p.camZ).toBeCloseTo(2 * 54 / Math.tan((14.5 * Math.PI) / 180), 6); // riquadro stretto: la camera arretra
  const n = p.pack(a);
  expect(n).toBe(2 + 2 * q.trail);
  const d = p.data;
  expect(d[96]).toBeCloseTo(1.06, 6); // esposizione
  expect(d[15]).toBe(1); // vista: matrice affine
  expect(d[16 + 11]).toBe(-1); // proiezione prospettica
  const obj = (k) => 100 + k * 40;
  expect(d[obj(OBJ.rim) + 19]).toBeCloseTo(0.34, 6); // opacità del filetto
  expect([0, 1]).toContain(d[obj(OBJ.ring0) + 35]); // fase trasparente (prima o dopo il filetto)
  for (let s = 0; s < n; s++) expect([0, 1]).toContain(d[580 + s * 12 + 8]);
  expect(Array.from(d).every(Number.isFinite)).toBe(true);
});
