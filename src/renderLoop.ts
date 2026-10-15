// A canvas owns no animation frame while hidden, outside the viewport, or held (a full-screen scene covers the site).
const loops = new Set<() => void>();
let held = false;
export function holdLoops(on: boolean) { if (held === on) return; held = on; loops.forEach((sync) => sync()); }
// Steady pacing: draw every k display refreshes, k being the multiple nearest to the wanted rate (rounding towards more
// frames). At 144 Hz, 60 wanted gives every other refresh: 72 even frames instead of 48 uneven ones.
export const refreshes = (want: number, vsync: number) => Math.max(1, Math.floor(1000 / want / vsync + 0.35));
// the fps to ask renderLoop for: it draws once (k - 0.4) refreshes have passed, that is exactly every k
export const steadyFps = (want: number, vsync: number) => (vsync ? 1000 / ((refreshes(want, vsync) - 0.4) * vsync + 0.5) : want);
// fps receives the estimated display refresh period (ms, 0 until known), so a caller can ask for an exact multiple of it
export function renderLoop(draw: (time: number) => void, fps: (vsync: number) => number, element?: Element, resume?: () => void) {
  let raf = 0, visible = !element || typeof IntersectionObserver === "undefined", disposed = false, last = -Infinity, prev = 0, vsync = 0;
  const active = () => !disposed && visible && !held && !document.hidden;
  const frame = (time: number) => {
    raf = 0;
    if (!active()) return;
    const step = time - prev; prev = time;
    // long steps (frames the browser skipped) weigh little, just enough to follow a display with another refresh rate
    if (step > 2 && step < 40) vsync = vsync ? vsync + (step - vsync) * (step < vsync * 1.5 ? 0.05 : 0.01) : step;
    const interval = 1000 / Math.max(1, fps(vsync));
    if (time - last >= interval - 0.5) { last = time; draw(time); }
    if (active()) raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    if (!active()) { cancelAnimationFrame(raf); raf = 0; return; }
    if (!raf) { last = -Infinity; resume?.(); raf = requestAnimationFrame(frame); }
  };
  const observer = element && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting; sync();
  }) : null;
  if (element) observer?.observe(element);
  document.addEventListener("visibilitychange", sync);
  loops.add(sync);
  sync();
  return () => { disposed = true; cancelAnimationFrame(raf); observer?.disconnect(); loops.delete(sync); document.removeEventListener("visibilitychange", sync); };
}
