import { WINDOW, ROOM, STEP_X, STEP_TOP, STEP_D, TROPHY_TOP, CARPET, camera, project, celestial, moodAt, DAY, NIGHT } from "./stage";
import { shadowShader, giShader, volShader, mainShader, presentShader, GI_PROBES } from "./shaders";

// dentro il vano del finestrone (rettangolo con l'arco in cima), lontano dal telaio
const inWindow = (x, y) => (y > WINDOW.ya ? Math.hypot(x, y - WINDOW.ya) < WINDOW.r - WINDOW.frame : Math.abs(x) < WINDOW.r - WINDOW.frame && y > WINDOW.y0 + WINDOW.frame);
const toWindow = (p, L) => { const k = (ROOM.back - p[2]) / L[2]; return [p[0] + L[0] * k, p[1] + L[1] * k]; };

test("sun and moon are always visible through the arched window and light the trophies and the carpet", () => {
  const cam = camera(1440, 900, 240, 230);
  for (const night of [false, true]) {
    for (let t = 0; t < 900; t += 4.3) {
      const L = celestial(t, night);
      expect(Math.hypot(...L)).toBeCloseTo(1, 6);
      expect(L[2]).toBeLessThan(0);
      expect(L[1]).toBeGreaterThan(0.25); // dall'alto
      expect(inWindow(...toWindow(cam.pos, L))).toBe(true); // l'astro si vede nel vetro
      STEP_X.forEach((x, i) => expect(inWindow(...toWindow([x, TROPHY_TOP[i], -0.15], L))).toBe(true));
      expect(inWindow(...toWindow([0, 0, CARPET.z0 + 2], L))).toBe(true); // i fasci arrivano sul tappeto
    }
  }
});

test("the camera frames the podium inside the free area of the page, on desktop and on phones", () => {
  for (const [w, h, left, top] of [[1440, 900, 240, 230], [1920, 1080, 240, 230], [390, 844, 0, 150]]) {
    const c = camera(w, h, left, top);
    STEP_X.forEach((x, i) => {
      for (const sx of [-1.1, 1.1]) {
        const p = project(c, [x + sx, 0.36, STEP_D]);
        expect(p.x).toBeGreaterThan(left); expect(p.x).toBeLessThan(w);
        expect(p.y).toBeGreaterThan(top); expect(p.y).toBeLessThan(h);
      }
      expect(project(c, [x, TROPHY_TOP[i] + 0.22, -0.15]).y).toBeGreaterThan(top);
    });
    const tops = STEP_X.map((x, i) => project(c, [x, STEP_TOP[i], STEP_D]));
    expect(tops[0].y).toBeLessThan(tops[1].y); expect(tops[1].y).toBeLessThan(tops[2].y);
    expect(Math.abs(tops[0].x - (left + (w - left) / 2))).toBeLessThan(2); // al centro dell'area dei contenuti
  }
});

test("day and night blend smoothly and the shaders embed the scene", () => {
  expect(moodAt(0).sunI).toBeCloseTo(DAY.sunI, 9); expect(moodAt(1).sunI).toBeCloseTo(NIGHT.sunI, 9);
  expect(moodAt(0.5).sun[2]).toBeCloseTo((DAY.sun[2] + NIGHT.sun[2]) / 2, 6);
  for (const src of [shadowShader, giShader, volShader, mainShader]) { expect(src).toContain("fn trace("); expect(src).not.toMatch(/NaN|undefined/); }
  expect(presentShader).toContain("fsPresent");
  expect(giShader).toContain(`${GI_PROBES * 6}u`);
});
