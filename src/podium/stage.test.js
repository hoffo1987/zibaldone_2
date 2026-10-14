import { STEPS, WINDOW, ROOM, camera, project, celestial, moodAt, DAY, NIGHT } from "./stage";
import { giShader, volShader, mainShader, GI_PROBES } from "./shaders";

test("sun and moon always shine through the window onto the podium, from above", () => {
  for (const night of [false, true]) {
    for (let t = 0; t < 600; t += 3.7) {
      const L = celestial(t, night);
      expect(Math.hypot(...L)).toBeCloseTo(1, 6);
      expect(L[2]).toBeLessThan(0); // dietro la parete di fondo
      expect(L[1]).toBeGreaterThan(0.25); // dall'alto
      // dal centro della cima del primo gradino, verso l'astro, si passa dal vetro
      const top = [STEPS[0].c[0], STEPS[0].c[1] + STEPS[0].h[1], STEPS[0].c[2]], k = (ROOM.back - top[2]) / L[2];
      const x = top[0] + L[0] * k, y = top[1] + L[1] * k;
      expect(x).toBeGreaterThan(WINDOW.x0); expect(x).toBeLessThan(WINDOW.x1);
      expect(y).toBeGreaterThan(WINDOW.y0); expect(y).toBeLessThan(WINDOW.y1);
    }
  }
});

test("the camera frames the whole podium and projects the plates onto the step tops", () => {
  for (const [w, h] of [[1000, 620], [390, 420]]) {
    const c = camera(w / h);
    for (const s of STEPS) for (const sx of [-1, 1]) {
      const p = project(c, [s.c[0] + sx * s.h[0], 0, s.c[2] + s.h[2]], w, h);
      expect(p).not.toBeNull();
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(w);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(h);
    }
    // il primo gradino è il più alto anche sullo schermo, e sta al centro
    const tops = STEPS.map((s) => project(c, [s.c[0], s.c[1] + s.h[1], s.c[2] + s.h[2]], w, h));
    expect(tops[0].y).toBeLessThan(tops[1].y); expect(tops[1].y).toBeLessThan(tops[2].y);
    expect(Math.abs(tops[0].x - w / 2)).toBeLessThan(2);
  }
});

test("day and night blend smoothly and the shaders embed the scene", () => {
  expect(moodAt(0).sunI).toBeCloseTo(DAY.sunI, 9); expect(moodAt(1).sunI).toBeCloseTo(NIGHT.sunI, 9);
  expect(moodAt(0.5).sun[2]).toBeCloseTo((DAY.sun[2] + NIGHT.sun[2]) / 2, 6);
  for (const src of [giShader, volShader, mainShader]) { expect(src).toContain("fn trace("); expect(src).not.toMatch(/NaN|undefined/); }
  expect(giShader).toContain(`${GI_PROBES * 6}u`);
});
