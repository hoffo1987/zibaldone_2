import { renderLoop, holdLoops, holdBackground, refreshes, steadyFps } from "./renderLoop";

let pending, observer, hidden, next;
beforeEach(() => {
  pending = new Map(); next = 0; hidden = false;
  jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(fn => { pending.set(++next, fn); return next; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => pending.delete(id));
  window.IntersectionObserver = class {
    constructor(fn) { observer = fn; }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => { jest.restoreAllMocks(); delete window.IntersectionObserver; });
const tick = time => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn(time)); };

test("stops every frame offscreen, resumes, and disposes without restarting", () => {
  const draw = jest.fn(), stop = renderLoop(draw, () => 30, document.createElement("canvas"));
  expect(pending.size).toBe(0);
  observer([{ isIntersecting: true }]); tick(0); tick(16); tick(34);
  expect(draw).toHaveBeenCalledTimes(2);
  observer([{ isIntersecting: false }]); expect(pending.size).toBe(0);
  observer([{ isIntersecting: true }]); tick(100);
  expect(draw).toHaveBeenCalledTimes(3);
  stop(); observer([{ isIntersecting: true }]);
  expect(pending.size).toBe(0);
});

test("stops in a background tab and resumes with the current FPS setting", () => {
  let fps = 20;
  const draw = jest.fn(), stop = renderLoop(draw, () => fps);
  tick(0); tick(34); expect(draw).toHaveBeenCalledTimes(1);
  hidden = true; document.dispatchEvent(new Event("visibilitychange")); expect(pending.size).toBe(0);
  fps = 60; hidden = false; document.dispatchEvent(new Event("visibilitychange"));
  tick(100); tick(117); expect(draw).toHaveBeenCalledTimes(3);
  stop();
});


test("holds every loop while a full-screen scene covers the site, then resumes", () => {
  const a = jest.fn(), b = jest.fn(), stopA = renderLoop(a, () => 60), stopB = renderLoop(b, () => 60);
  tick(0); expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
  holdLoops(true); expect(pending.size).toBe(0);
  holdLoops(false); tick(50);
  expect(a).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(2);
  stopA(); stopB();
});

test("tells fps the display refresh period, so a loop can draw on an exact multiple of it", () => {
  const seen = [], draw = jest.fn(), p = 1000 / 144;
  const stop = renderLoop(draw, (vsync) => { seen.push(vsync); return steadyFps(60, vsync); });
  for (let i = 0; i <= 200; i++) tick(i * p);
  expect(seen[seen.length - 1]).toBeCloseTo(p, 3);
  // at 144 Hz, 60 wanted: every other refresh, 72 even frames a second (not 48 uneven ones)
  draw.mockClear();
  for (let i = 201; i <= 344; i++) tick(i * p);
  expect(draw).toHaveBeenCalledTimes(72);
  stop();
});

test("steady pacing picks the refresh multiple nearest to the wanted rate", () => {
  expect([60, 75, 90, 120, 144, 165, 240].map((hz) => refreshes(60, 1000 / hz))).toEqual([1, 1, 1, 2, 2, 3, 4]);
  expect(refreshes(30, 1000 / 60)).toBe(2);
  expect(steadyFps(60, 0)).toBe(60);
});

test('a reader suspends covered scenes while its own signal keeps running', () => {
  const bg = jest.fn(), fg = jest.fn();
  const stopBg = renderLoop(bg, () => 60), stopFg = renderLoop(fg, () => 60, undefined, undefined, true);
  tick(0); holdBackground(true); tick(20);
  expect(bg).toHaveBeenCalledTimes(1); expect(fg).toHaveBeenCalledTimes(2);
  holdLoops(true); expect(pending.size).toBe(0);
  holdLoops(false); tick(40); expect(bg).toHaveBeenCalledTimes(1);
  holdBackground(false); tick(60); expect(bg).toHaveBeenCalledTimes(2);
  stopBg(); stopFg();
});

test('an idle signal owns no animation frame and wakes immediately on input', () => {
  let fps = 0;
  const draw = jest.fn(), stop = renderLoop(draw, () => fps);
  tick(0); expect(pending.size).toBe(0);
  fps = 60; stop.invalidate(); tick(2);
  expect(draw).toHaveBeenCalledTimes(2); expect(pending.size).toBe(1);
  fps = 0; tick(20); expect(pending.size).toBe(0);
  stop(); stop.invalidate(); expect(pending.size).toBe(0);
});
