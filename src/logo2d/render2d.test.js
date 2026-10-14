import { createLogo2D, shade, toSRGB } from "./render2d";
import { LogoAnim, quality, lin } from "../logo3d/anim";

const fakeCtx = () => {
  const grad = { addColorStop: jest.fn() }, state = { fills: 0, strokes: 0, images: 0, canvas: { width: 1, height: 1 } };
  return new Proxy(state, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "fill") return () => { t.fills++; };
      if (k === "stroke") return () => { t.strokes++; };
      if (k === "drawImage") return () => { t.images++; };
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
let ctx;
beforeEach(() => { ctx = fakeCtx(); jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx); });
afterEach(() => jest.restoreAllMocks());

test("the Canvas 2D logo draws the entrance, a whole spin with the back side, and the spark burst without errors", () => {
  for (const mobile of [false, true]) {
    const q = quality(mobile), a = new LogoAnim(true, q, () => 0.42), cv = document.createElement("canvas"), r = createLogo2D(cv, q);
    r.resize(340, 340, 2);
    expect(cv.width).toBe(680);
    for (let i = 0; i < 90; i++) { a.step(1 / 30); r.draw(a); }
    a.kick(); a.kick();
    const before = ctx.images;
    for (let i = 0; i < 300; i++) { a.step(1 / 30); r.draw(a); }
    expect(ctx.images).toBeGreaterThan(before); // bagliori e scintille
    a.drag = true; a.dragBy(240, 0.016); a.drag = false; // trascinamento fino al retro
    for (let i = 0; i < 30; i++) { a.step(1 / 30); r.draw(a); }
    expect(ctx.fills).toBeGreaterThan(1000);
    expect(ctx.strokes).toBeGreaterThan(1000);
  }
});

test("the 2D material matches the WebGPU plate colours (front, lit by the same studio)", () => {
  const plate = { color: [1, 1, 1], metal: 0.08, rough: 0.26, cc: 0.95, ccRough: 0.1, envI: 0.95 };
  const A = lin(0x22d8c0), B = lin(0x07423d), mix = (t) => A.map((x, i) => x + (B[i] - x) * t);
  // riferimenti misurati sul render WebGPU (faccia frontale a riposo), tolleranza di qualche livello
  const near = (t, ref) => toSRGB(shade(plate, [0, 0, 1], [0, 0, 1], [0, 0, 0], 1, mix(t))).forEach((c, i) => expect(Math.abs(c - ref[i])).toBeLessThan(26));
  near(0.25, [130, 219, 205]);
  near(0.5, [63, 193, 175]);
});

test("without a 2D context the renderer reports it instead of throwing", () => {
  ctx = null;
  expect(createLogo2D(document.createElement("canvas"), quality(false))).toBeNull();
});
