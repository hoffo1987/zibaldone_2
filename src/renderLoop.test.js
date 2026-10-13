import { renderLoop } from "./renderLoop";

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
